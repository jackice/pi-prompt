import { basename } from "node:path";

import { displayWidth, InlineGauge, middleTruncate, type GaugeSlot, type SegmentSpec, type SegmentVariant, type UiTheme } from "@jackice/pi-ui";

import { SEGMENT_PRIORITIES, type PromptConfig, type SegmentId } from "./config.ts";
import type { PromptFacts } from "./status/facts.ts";
import { formatCapacity, formatTokens } from "./status/usage.ts";

export interface SegmentBuildInput {
  facts: PromptFacts;
  config: PromptConfig;
  theme: UiTheme;
  hostname?: string | undefined;
  home?: string | undefined;
  now: number;
  extensionStatuses?: ReadonlyMap<string, string> | undefined;
}

interface SegmentGroups {
  left: SegmentSpec[];
  right: SegmentSpec[];
}

export interface BandSegments extends SegmentGroups {
  gauge?: GaugeSlot | undefined;
  detail?: SegmentGroups;
}

function variant(text: string, tone: SegmentVariant["tone"] = "text"): SegmentVariant {
  return { text, tone };
}

function spec(
  id: SegmentId,
  side: "left" | "right",
  variants: { full: string; compact?: string | undefined; min?: string | undefined },
  tone: SegmentVariant["tone"] = "text",
): SegmentSpec {
  return {
    id,
    side,
    priority: SEGMENT_PRIORITIES[id] ?? 0,
    full: variant(variants.full, tone),
    ...(variants.compact !== undefined ? { compact: variant(variants.compact, tone) } : {}),
    ...(variants.min !== undefined ? { min: variant(variants.min, tone) } : {}),
  };
}

export function homePath(cwd: string, home: string | undefined): string {
  if (home && cwd === home) return "~";
  if (home && cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`;
  return cwd;
}

function shortId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return id.length > 8 ? id.slice(0, 8) : id;
}

function modelName(facts: PromptFacts): { full: string; compact: string; min: string } | undefined {
  const model = facts.model;
  if (!model) return undefined;
  const thinking = model.thinking && model.thinking !== "off" ? model.thinking : undefined;
  const name = model.name && model.name.length > 0 ? model.name : model.id;
  const short = middleTruncate(name, 18);
  return {
    full: thinking ? `${short} ${thinking}` : short,
    compact: thinking ? `${middleTruncate(model.id, 12)} ${thinking}` : middleTruncate(model.id, 12),
    min: middleTruncate(model.id, 8),
  };
}

function pathVariants(facts: PromptFacts, home: string | undefined): { full: string; compact: string; min: string } {
  const path = homePath(facts.session.cwd, home);
  const base = basename(facts.session.cwd) || facts.session.cwd;
  return {
    full: path,
    compact: middleTruncate(base, 14),
    min: middleTruncate(base, 8),
  };
}

function gitVariants(facts: PromptFacts): { full: string; compact: string; min: string } | undefined {
  const git = facts.git;
  if (!git?.branch) return undefined;
  const dirtyCount = (git.staged ?? 0) + (git.unstaged ?? 0) + (git.untracked ?? 0) + (git.conflicts ?? 0);
  const suffix = git.stale ? "?" : dirtyCount > 0 ? "*" : "";
  const branch = git.branch;
  return {
    full: `${middleTruncate(branch, 20)}${suffix}`,
    compact: `${middleTruncate(branch, 12)}${suffix}`,
    min: `${middleTruncate(branch, 6)}${suffix}`,
  };
}

function tokenSpec(
  id: SegmentId,
  side: "left" | "right",
  value: number | undefined,
  formatter: (count: number) => string,
  glyph: string,
): SegmentSpec | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  return spec(id, side, { full: `${glyph}${formatter(value)}` });
}

function aggregateStatuses(
  statuses: ReadonlyMap<string, string> | undefined,
  consumed: ReadonlySet<string>,
  config: PromptConfig,
): SegmentSpec | undefined {
  if (!statuses || statuses.size === 0) return undefined;
  const parts: string[] = [];
  for (const [key, value] of statuses) {
    if (consumed.has(key)) continue;
    if (config.extensionStatusKeys.workflow === key) continue;
    if (config.extensionStatusKeys.subagents === key) continue;
    parts.push(`${key}: ${value}`);
  }
  if (parts.length === 0) return undefined;
  return spec("extension_statuses", "right", {
    full: parts.join(" · "),
    compact: parts.map((part) => part.split(":")[0] ?? part).join(" · "),
    min: `${parts.length} status`,
  }, "muted");
}

function makeSegmentBuilders(input: SegmentBuildInput): Record<SegmentId, () => SegmentSpec | undefined> {
  const { facts, config } = input;
  const statuses = input.extensionStatuses;
  const ascii = config.icons === "ascii";
  const model = modelName(facts);

  return {
    brand: () => spec("brand", "left", { full: config.brand.text }, "accent"),
    hostname: () => {
      const host = input.hostname;
      return host ? spec("hostname", "left", { full: middleTruncate(host, 8) }, "muted") : undefined;
    },
    model: () => (model ? spec("model", "left", model, "accent") : undefined),
    path: () => spec("path", "left", pathVariants(facts, input.home), "muted"),
    git: () => {
      const variants = gitVariants(facts);
      if (!variants) return undefined;
      const dirty = (facts.git?.staged ?? 0) + (facts.git?.unstaged ?? 0) + (facts.git?.untracked ?? 0) + (facts.git?.conflicts ?? 0);
      return spec("git", "left", variants, dirty > 0 ? "warning" : "muted");
    },
    session: () => {
      const id = shortId(facts.session.id);
      return id ? spec("session", "left", { full: id }, "muted") : undefined;
    },
    workflow: () => {
      const key = config.extensionStatusKeys.workflow;
      const value = key ? statuses?.get(key) : undefined;
      return value ? spec("workflow", "right", { full: value }, "accent") : undefined;
    },
    subagents: () => {
      const key = config.extensionStatusKeys.subagents;
      const value = key ? statuses?.get(key) : undefined;
      return value ? spec("subagents", "right", { full: value }, "accent") : undefined;
    },
    extension_statuses: () => {
      const consumed = new Set(Object.values(config.extensionStatusKeys));
      return aggregateStatuses(statuses, consumed, config);
    },
    token_in: () => tokenSpec("token_in", "right", facts.usage?.input, formatTokens, ascii ? "in " : "↑"),
    token_out: () => tokenSpec("token_out", "right", facts.usage?.output, formatTokens, ascii ? "out " : "↓"),
    token_total: () => {
      const total = facts.usage?.totalTokens;
      if (total === undefined || total <= 0) return undefined;
      return spec("token_total", "right", { full: `${ascii ? "total " : "Σ"}${formatTokens(total)}` }, "muted");
    },
    cache_read: () => tokenSpec("cache_read", "right", facts.usage?.cacheRead, formatTokens, ascii ? "read " : "R"),
    cache_write: () => tokenSpec("cache_write", "right", facts.usage?.cacheWrite, formatTokens, ascii ? "write " : "W"),
    token_rate: () => {
      const rate = facts.runtime.tokensPerSecond;
      if (facts.runtime.phase !== "running" || rate === undefined || !Number.isFinite(rate) || rate <= 0) {
        return undefined;
      }
      return spec("token_rate", "right", { full: `${Math.round(rate)}t/s` }, "muted");
    },
    elapsed: () => {
      const duration = facts.runtime.durationMs;
      if (duration === undefined || !Number.isFinite(duration) || duration <= 0) return undefined;
      const seconds = duration / 1000;
      return spec("elapsed", "right", { full: seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m${Math.round(seconds % 60)}s` }, "muted");
    },
    cost: () => {
      if (!config.cost.enabled) return undefined;
      const cost = facts.usage?.costTotal;
      if (cost === undefined || !Number.isFinite(cost) || cost <= 0) return undefined;
      const prefix = facts.usage?.costFromProvider ? "$" : ascii ? "~$" : "≈$";
      return spec("cost", "right", { full: `${prefix}${cost.toFixed(3)}` }, "muted");
    },
    time: () => {
      const date = new Date(input.now);
      const hh = date.getHours().toString().padStart(2, "0");
      const mm = date.getMinutes().toString().padStart(2, "0");
      return spec("time", "right", { full: `${hh}:${mm}` }, "muted");
    },
  };
}

function placed(spec: SegmentSpec | undefined, side: "left" | "right"): SegmentSpec | undefined {
  return spec ? { ...spec, side } : undefined;
}

export function buildBandSegments(input: SegmentBuildInput): BandSegments {
  const { facts, config, theme } = input;
  const ascii = config.icons === "ascii";
  const builders = makeSegmentBuilders(input);
  const primary: SegmentGroups = { left: [], right: [] };
  for (const id of config.segments.left) {
    const built = placed(builders[id](), "left");
    if (built) primary.left.push(built);
  }
  for (const id of config.segments.right) {
    const built = placed(builders[id](), "right");
    if (built) primary.right.push(built);
  }

  const detail: SegmentGroups = { left: [], right: [] };
  const primaryIds = new Set([...config.segments.left, ...config.segments.right]);
  const add = (id: SegmentId, target: SegmentGroups): void => {
    if (primaryIds.has(id)) return;
    primaryIds.add(id);
    const built = builders[id]();
    if (built) target[built.side].push(built);
  };
  if (config.footerMode === "none") {
    for (const id of config.detailSegments) add(id, detail);
    for (const id of config.metaSegments) add(id, primary);
  }
  if (config.clock.enabled) add("time", primary);

  return {
    ...primary,
    gauge: buildGauge(facts, config, theme, ascii),
    ...(detail.left.length || detail.right.length ? { detail } : {}),
  };
}

function buildGauge(
  facts: PromptFacts,
  config: PromptConfig,
  theme: UiTheme,
  ascii: boolean,
): GaugeSlot | undefined {
  if (!config.context.enabled || config.context.style === "off") return undefined;
  if (!config.segments.left.includes("model") && !config.segments.left.includes("brand") && facts.context === undefined) {
    return undefined;
  }
  const percent = facts.context?.percent;
  const capacity = facts.context?.capacity;
  const known = percent !== undefined && Number.isFinite(percent);
  const label = known ? `${Math.round(percent)}%` : "?";
  const endLabel = formatCapacity(capacity);
  const tone = known && percent >= config.context.critical
    ? "error"
    : known && percent >= config.context.warning
      ? "warning"
      : "accent";
  const gauge = new InlineGauge(
    theme,
    { ...(known ? { percent } : {}), label, ...(endLabel !== undefined ? { endLabel } : {}), tone },
    { ascii },
  );
  const labelWidth = displayWidth(label);
  const endWidth = endLabel ? displayWidth(endLabel) + 2 : 0;
  const minWidth = Math.min(40, labelWidth + endWidth + (config.context.style === "compact" ? 1 : 3));
  return { minWidth, render: (width) => gauge.render(width) };
}

