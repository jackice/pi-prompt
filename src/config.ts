import { readFileSync } from "node:fs";

import { displayWidth } from "@jackice/pi-ui";

export const SEGMENT_PRIORITIES = {
  brand: 20,
  hostname: 10,
  model: 100,
  path: 80,
  git: 75,
  session: 30,
  workflow: 60,
  subagents: 65,
  extension_statuses: 40,
  token_in: 35,
  token_out: 35,
  token_total: 35,
  cache_read: 35,
  cache_write: 30,
  token_rate: 50,
  elapsed: 45,
  cost: 15,
  time: 10,
} as const satisfies Record<string, number>;

/** context 只作为中央 gauge 存在，不能出现在左右分段配置里。 */
export const SEGMENT_IDS = Object.freeze(Object.keys(SEGMENT_PRIORITIES) as SegmentId[]);
export type SegmentId = keyof typeof SEGMENT_PRIORITIES;

export type PromptShapeId = "band" | "borderless" | "native";
export type SeparatorName = "ascii" | "pipe" | "slash" | "dot" | "none";
export type IconMode = "unicode" | "ascii";
export type FooterMode = "native" | "replace" | "compact" | "hidden" | "inline";
export type GitRefreshMode = "event" | "manual" | "poll";

export interface PromptConfig {
  enabled: boolean;
  shape: PromptShapeId;
  separator: SeparatorName;
  transparent: boolean;
  icons: IconMode;
  prefix: string;
  brand: { text: string };
  footerMode: FooterMode;
  segments: { left: SegmentId[]; right: SegmentId[] };
  /** inline 模式的 editor 第 3 行；不影响 native/compact/hidden/replace。 */
  metaSegments: SegmentId[];
  extensionStatusKeys: Record<string, string>;
  context: {
    enabled: boolean;
    style: "embedded" | "compact" | "off";
    warning: number;
    critical: number;
  };
  git: {
    enabled: boolean;
    dirty: boolean;
    worktree: boolean;
    ttlMs: number;
    refresh: GitRefreshMode;
    pollIntervalMs: number;
  };
  clock: { enabled: boolean };
  cost: { enabled: boolean };
}

export interface ResolvedConfig {
  config: PromptConfig;
  errors: string[];
  /** 出现硬错误时 config 为安全默认值，调用方应保留上一份有效配置。 */
  hardError: boolean;
}

const NATIVE_BASE: PromptConfig = {
  enabled: true,
  shape: "band",
  separator: "ascii",
  transparent: true,
  icons: "unicode",
  prefix: "╰─ ",
  brand: { text: "φ" },
  footerMode: "native",
  segments: { left: ["brand", "model"], right: ["token_rate"] },
  metaSegments: ["path", "git", "session", "cost"],
  extensionStatusKeys: {},
  context: { enabled: true, style: "embedded", warning: 70, critical: 90 },
  git: {
    enabled: false,
    dirty: true,
    worktree: true,
    ttlMs: 5000,
    refresh: "event",
    pollIntervalMs: 10000,
  },
  clock: { enabled: false },
  cost: { enabled: false },
};

const REPLACE_BASE: PromptConfig = {
  ...NATIVE_BASE,
  footerMode: "replace",
  segments: {
    left: ["brand", "model", "path", "git", "session"],
    right: [
      "token_rate",
      "token_in",
      "token_out",
      "cache_read",
      "cache_write",
      "cost",
      "workflow",
      "subagents",
      "extension_statuses",
    ],
  },
  extensionStatusKeys: { workflow: "jackice:workflow", subagents: "jackice:subagents" },
  git: { ...NATIVE_BASE.git, enabled: true },
  cost: { enabled: true },
};

export function defaultConfig(footerMode: FooterMode = "native"): PromptConfig {
  const config = clone(footerMode === "replace" ? REPLACE_BASE : NATIVE_BASE);
  config.footerMode = footerMode;
  return config;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBoolean(value: unknown, field: string, errors: string[], fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  errors.push(`${field} 必须是布尔值`);
  return fallback;
}

function asString(value: unknown, field: string, errors: string[], fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value === "string") return value;
  errors.push(`${field} 必须是字符串`);
  return fallback;
}

function asFinite(value: unknown, field: string, errors: string[], fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max) return value;
  errors.push(`${field} 必须是 ${min}–${max} 之间的有限数`);
  return fallback;
}

function isSafeLabel(value: string): boolean {
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return false;
  if (value.includes("\n") || value.includes("\r")) return false;
  const width = displayWidth(value);
  return width >= 1 && width <= 8;
}

function sanitizePrefix(
  value: string,
  icons: IconMode,
  field: string,
  errors: string[],
): string | undefined {
  if (!isSafeLabel(value)) {
    errors.push(`${field} 必须是显示宽度 1–8 的安全可打印单行文本`);
    return undefined;
  }
  if (icons === "ascii" && /[^\u0020-\u007e]/.test(value)) {
    errors.push(`${field} 在 ASCII 模式下只能使用 ASCII 字符`);
    return undefined;
  }
  return value;
}

function parseSegments(
  raw: unknown,
  fallback: SegmentId[],
  side: "left" | "right",
  seen: Set<string>,
  errors: string[],
): SegmentId[] {
  if (raw === undefined) {
    for (const id of fallback) seen.add(id);
    return [...fallback];
  }
  if (!Array.isArray(raw)) {
    errors.push(`segments.${side} 必须是字符串数组`);
    return [...fallback];
  }
  const result: SegmentId[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      errors.push(`segments.${side} 含非字符串项`);
      continue;
    }
    if (!(item in SEGMENT_PRIORITIES)) {
      errors.push(`未知 segment: ${item}（已忽略）`);
      continue;
    }
    if (seen.has(item)) {
      errors.push(`重复 segment: ${item}（已忽略）`);
      continue;
    }
    seen.add(item);
    result.push(item as SegmentId);
  }
  return result;
}

function parseMetaSegments(
  raw: unknown,
  fallback: SegmentId[],
  errors: string[],
): SegmentId[] {
  if (raw === undefined) return [...fallback];
  if (!Array.isArray(raw)) {
    errors.push("metaSegments 必须是字符串数组");
    return [...fallback];
  }
  const seen = new Set<string>();
  const result: SegmentId[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      errors.push("metaSegments 含非字符串项");
      continue;
    }
    if (!(item in SEGMENT_PRIORITIES)) {
      errors.push(`metaSegments 未知 segment: ${item}（已忽略）`);
      continue;
    }
    if (seen.has(item)) {
      errors.push(`metaSegments 重复 segment: ${item}（已忽略）`);
      continue;
    }
    seen.add(item);
    result.push(item as SegmentId);
  }
  return result;
}

function mergeBase(footerMode: FooterMode, raw: Record<string, unknown>, errors: string[]): PromptConfig {
  const config = defaultConfig(footerMode);
  const pick = <T extends object>(value: unknown, fallback: T): T =>
    isRecord(value) ? { ...fallback, ...value } : fallback;

  config.enabled = asBoolean(raw.enabled, "enabled", errors, config.enabled);
  if (raw.shape !== undefined) {
    if (raw.shape === "band" || raw.shape === "native" || raw.shape === "borderless") config.shape = raw.shape;
    else errors.push("shape 必须是 band|native|borderless");
  }
  if (raw.separator !== undefined) {
    if (["ascii", "pipe", "slash", "dot", "none"].includes(raw.separator as string)) {
      config.separator = raw.separator as SeparatorName;
    } else {
      errors.push("separator 必须是 ascii|pipe|slash|dot|none");
    }
  }
  config.transparent = asBoolean(raw.transparent, "transparent", errors, config.transparent);
  if (raw.icons !== undefined) {
    if (raw.icons === "unicode" || raw.icons === "ascii") config.icons = raw.icons;
    else errors.push("icons 必须是 unicode|ascii");
  }
  if (raw.footerMode !== undefined) {
    if (
      raw.footerMode === "native" ||
      raw.footerMode === "replace" ||
      raw.footerMode === "compact" ||
      raw.footerMode === "hidden" ||
      raw.footerMode === "inline"
    ) {
      config.footerMode = raw.footerMode;
    } else {
      errors.push("footerMode 必须是 native|replace|compact|hidden|inline");
    }
  }
  if (raw.prefix !== undefined) {
    if (typeof raw.prefix !== "string") errors.push("prefix 必须是字符串");
    else {
      const prefix = sanitizePrefix(raw.prefix, config.icons, "prefix", errors);
      if (prefix !== undefined) config.prefix = prefix;
    }
  }

  const brand = pick(raw.brand, config.brand);
  config.brand = { text: asString(brand.text, "brand.text", errors, config.brand.text) };
  if (!isSafeLabel(config.brand.text)) {
    errors.push("brand.text 必须是显示宽度 1–8 的安全可打印单行文本");
    config.brand = { ...defaultConfig(footerMode).brand };
  }
  if (config.icons === "ascii" && /[^\u0020-\u007e]/.test(config.brand.text)) {
    errors.push("brand.text 在 ASCII 模式下只能使用 ASCII 字符");
    config.brand = { ...defaultConfig(footerMode).brand };
  }

  const segments = isRecord(raw.segments) ? raw.segments : {};
  const seen = new Set<string>();
  config.segments = {
    left: parseSegments(segments.left, config.segments.left, "left", seen, errors),
    right: parseSegments(segments.right, config.segments.right, "right", seen, errors),
  };
  config.metaSegments = parseMetaSegments(raw.metaSegments, config.metaSegments, errors);

  if (raw.extensionStatusKeys !== undefined) {
    if (!isRecord(raw.extensionStatusKeys)) {
      errors.push("extensionStatusKeys 必须是字符串映射");
    } else {
      const mapping: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw.extensionStatusKeys)) {
        if (typeof value === "string") mapping[key] = value;
        else errors.push(`extensionStatusKeys.${key} 必须是字符串`);
      }
      config.extensionStatusKeys = mapping;
    }
  }

  const context = pick(raw.context, config.context);
  config.context = {
    enabled: asBoolean(context.enabled, "context.enabled", errors, config.context.enabled),
    style:
      context.style === "embedded" || context.style === "compact" || context.style === "off"
        ? context.style
        : config.context.style,
    warning: asFinite(context.warning, "context.warning", errors, config.context.warning, 0, 100),
    critical: asFinite(context.critical, "context.critical", errors, config.context.critical, 0, 100),
  };
  if (context.style !== undefined && !["embedded", "compact", "off"].includes(context.style as string)) {
    errors.push("context.style 必须是 embedded|compact|off");
  }
  if (config.context.warning >= config.context.critical) {
    errors.push("context.warning 必须小于 context.critical");
  }

  const git = pick(raw.git, config.git);
  config.git = {
    enabled: asBoolean(git.enabled, "git.enabled", errors, config.git.enabled),
    dirty: asBoolean(git.dirty, "git.dirty", errors, config.git.dirty),
    worktree: asBoolean(git.worktree, "git.worktree", errors, config.git.worktree),
    ttlMs: asFinite(git.ttlMs, "git.ttlMs", errors, config.git.ttlMs, 500, 600000),
    refresh:
      git.refresh === "event" || git.refresh === "manual" || git.refresh === "poll"
        ? git.refresh
        : config.git.refresh,
    pollIntervalMs: asFinite(git.pollIntervalMs, "git.pollIntervalMs", errors, config.git.pollIntervalMs, 5000, 3600000),
  };
  if (git.refresh !== undefined && !["event", "manual", "poll"].includes(git.refresh as string)) {
    errors.push("git.refresh 必须是 event|manual|poll");
  }

  const clock = pick(raw.clock, config.clock);
  config.clock = { enabled: asBoolean(clock.enabled, "clock.enabled", errors, config.clock.enabled) };
  const cost = pick(raw.cost, config.cost);
  config.cost = { enabled: asBoolean(cost.enabled, "cost.enabled", errors, config.cost.enabled) };

  return config;
}

export function resolveConfig(raw: unknown): ResolvedConfig {
  if (!isRecord(raw)) {
    return {
      config: defaultConfig("native"),
      errors: raw === undefined ? [] : ["配置根节点必须是对象"],
      hardError: raw !== undefined,
    };
  }
  const errors: string[] = [];
  const footerMode: FooterMode =
    raw.footerMode === "replace"
      ? "replace"
      : raw.footerMode === "compact"
        ? "compact"
        : raw.footerMode === "hidden"
          ? "hidden"
          : raw.footerMode === "inline"
            ? "inline"
            : "native";
  if (
    raw.footerMode !== undefined &&
    raw.footerMode !== "native" &&
    raw.footerMode !== "replace" &&
    raw.footerMode !== "compact" &&
    raw.footerMode !== "hidden" &&
    raw.footerMode !== "inline"
  ) {
    errors.push("footerMode 必须是 native|replace|compact|hidden|inline");
  }
  const config = mergeBase(footerMode, raw, errors);
  const hardError = errors.some((message) => !message.includes("（已忽略）"));
  return { config: hardError ? defaultConfig(footerMode) : config, errors, hardError };
}

export interface LoadedConfig extends ResolvedConfig {
  source: "file" | "default";
  path: string;
}

export function loadConfig(path: string): LoadedConfig {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { ...resolveConfig(undefined), source: "default", path };
  }
  try {
    const raw: unknown = JSON.parse(text);
    return { ...resolveConfig(raw), source: "file", path };
  } catch {
    return {
      config: defaultConfig("native"),
      errors: ["配置文件不是合法 JSON"],
      hardError: true,
      source: "file",
      path,
    };
  }
}

/** 配置是否要求启动 Git provider。 */
export function usesGit(config: PromptConfig): boolean {
  return config.git.enabled || config.segments.left.includes("git") || config.segments.right.includes("git");
}

export function usesClockSegment(config: PromptConfig): boolean {
  return config.clock.enabled || config.segments.left.includes("time") || config.segments.right.includes("time");
}
