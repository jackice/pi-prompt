import { hostname as osHostname } from "node:os";
import { join } from "node:path";

import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type KeybindingsManager,
  type ReadonlyFooterDataProvider,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { EditorComponent, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { fromPiTheme, layoutSegmentBar, sanitizeLine, type UiTheme } from "@jackice/pi-ui";

import {
  defaultConfig,
  loadConfig,
  usesClockSegment,
  usesGit,
  type PromptConfig,
  type LoadedConfig,
} from "../config.ts";
import { BandEditor } from "../composer/native-editor.ts";
import { buildBandSegments, homePath } from "../segments.ts";
import { GitProvider, toGitFacts, type GitExec, type GitStatus } from "../status/git.ts";
import type { ContextFacts, PromptFacts, UsageFacts } from "../status/facts.ts";
import { RenderScheduler } from "../status/scheduler.ts";
import { PromptStore } from "../status/store.ts";
import { buildUsageLedger, formatCapacity, formatTokens } from "../status/usage.ts";

type EditorFactoryFn = (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => EditorComponent;
type OwnedFactory = EditorFactoryFn & { __piPromptOwner?: string };

const OWNER_TAG = "jackice/pi-prompt";
const CONFIG_FILE = "pi-prompt.json";

interface Runtime {
  ctx: ExtensionContext;
  store: PromptStore;
  scheduler: RenderScheduler;
  config: PromptConfig;
  configRevision: number;
  factory?: EditorFactoryFn | undefined;
  footerData?: ReadonlyFooterDataProvider | undefined;
  tui?: TUI | undefined;
  theme?: Theme | undefined;
  uiTheme: UiTheme;
  themeVersion: number;
  hostname?: string | undefined;
  bandCache?: { key: string; status: string; detail?: string | undefined } | undefined;
  git?: GitProvider | undefined;
  pollTimer?: NodeJS.Timeout | undefined;
  startedAt?: number | undefined;
  lastRateAt: number;
}

function markFactory(factory: EditorFactoryFn): void {
  (factory as OwnedFactory).__piPromptOwner = OWNER_TAG;
}

function isOwnedFactory(factory: EditorFactoryFn): boolean {
  return (factory as OwnedFactory).__piPromptOwner === OWNER_TAG;
}

export class PromptExtension {
  private readonly pi: ExtensionAPI;
  private readonly configPath: string;
  private config: PromptConfig = defaultConfig("native");
  private configErrors: string[] = [];
  private configSource: "file" | "default" = "default";
  private haveValidConfig = false;
  private readonly notified = new Set<string>();
  private runtime: Runtime | undefined;

  constructor(pi: ExtensionAPI) {
    this.pi = pi;
    this.configPath = join(getAgentDir(), CONFIG_FILE);
    this.applyConfig(loadConfig(this.configPath), false);
  }

  register(): void {
    this.pi.on("session_start", (_event, ctx) => this.start(ctx));
    this.pi.on("session_shutdown", () => this.stop());
    this.pi.on("session_info_changed", (event) => {
      const runtime = this.runtime;
      if (!runtime) return;
      runtime.store.update({
        session: { ...runtime.store.get().session, name: event.name },
      });
      runtime.scheduler.requestNow();
    });
    this.pi.on("model_select", (_event, ctx) => {
      const runtime = this.runtime;
      if (!runtime) return;
      this.refreshData(ctx, runtime);
      runtime.scheduler.requestNow();
    });
    this.pi.on("thinking_level_select", (_event, ctx) => {
      const runtime = this.runtime;
      if (!runtime) return;
      this.refreshData(ctx, runtime);
      runtime.scheduler.requestNow();
    });
    this.pi.on("agent_start", () => {
      const runtime = this.runtime;
      if (!runtime) return;
      runtime.startedAt = Date.now();
      runtime.lastRateAt = 0;
      runtime.store.update({ runtime: { phase: "running", durationMs: 0 } });
      runtime.scheduler.requestNow();
    });
    this.pi.on("message_update", (event) => {
      const runtime = this.runtime;
      if (!runtime || event.message.role !== "assistant") return;
      this.sampleRate(runtime, event.message);
    });
    this.pi.on("message_end", (_event, ctx) => {
      const runtime = this.runtime;
      if (!runtime) return;
      this.refreshData(ctx, runtime);
      runtime.scheduler.requestThrottled();
    });
    this.pi.on("agent_settled", (_event, ctx) => {
      const runtime = this.runtime;
      if (!runtime) return;
      const duration = runtime.startedAt === undefined ? undefined : Date.now() - runtime.startedAt;
      runtime.startedAt = undefined;
      runtime.store.update({ runtime: { phase: "idle", durationMs: duration } });
      this.refreshData(ctx, runtime);
      runtime.scheduler.requestNow();
    });
    this.pi.on("tool_execution_end", (_event, ctx) => {
      const runtime = this.runtime;
      if (!runtime) return;
      this.refreshData(ctx, runtime);
      if (runtime.config.git.refresh === "event") runtime.git?.refresh(false);
      runtime.scheduler.requestThrottled();
    });
    this.pi.on("session_before_compact", () => {
      const runtime = this.runtime;
      if (!runtime) return;
      runtime.store.update({ runtime: { ...runtime.store.get().runtime, phase: "compacting" } });
      runtime.scheduler.requestNow();
    });
    this.pi.on("session_compact", (_event, ctx) => {
      const runtime = this.runtime;
      if (!runtime) return;
      runtime.store.update({ runtime: { phase: "idle" } });
      this.refreshData(ctx, runtime);
      runtime.scheduler.requestNow();
    });
    this.pi.on("session_compact_failed", (_event, ctx) => {
      const runtime = this.runtime;
      if (!runtime) return;
      runtime.store.update({ runtime: { phase: "idle" } });
      this.refreshData(ctx, runtime);
      runtime.scheduler.requestNow();
    });
    this.pi.on("session_tree", (_event, ctx) => {
      const runtime = this.runtime;
      if (!runtime) return;
      this.refreshData(ctx, runtime);
      runtime.git?.refresh(true);
      runtime.scheduler.requestNow();
    });
    this.pi.registerCommand("prompt-ui", {
      description: "查看或切换 pi-prompt 状态带（status / refresh / preset band|native|borderless）",
      handler: async (args, ctx) => this.command(args, ctx),
    });
  }

  private applyConfig(loaded: LoadedConfig, notify: boolean): void {
    this.configErrors = loaded.errors;
    this.configSource = loaded.source;
    if (!loaded.hardError) {
      this.config = loaded.config;
      this.haveValidConfig = true;
    } else if (!this.haveValidConfig) {
      this.config = defaultConfig("native");
    }
    if (notify) this.reportConfigErrors();
  }

  private reportConfigErrors(ctx?: ExtensionContext): void {
    for (const error of this.configErrors) {
      if (this.notified.has(error)) continue;
      this.notified.add(error);
      (ctx ?? this.runtime?.ctx)?.ui.notify(`pi-prompt 配置: ${error}`, "warning");
    }
  }

  private start(ctx: ExtensionContext): void {
    this.stop();
    if (ctx.mode !== "tui") return;
    this.applyConfig(loadConfig(this.configPath), false);
    this.reportConfigErrors(ctx);

    if (!this.config.enabled) {
      return;
    }

    const runtime: Runtime = {
      ctx,
      store: new PromptStore(ctx.cwd, 1),
      scheduler: new RenderScheduler(() => this.runtime?.tui?.requestRender()),
      config: this.config,
      configRevision: 1,
      uiTheme: fromPiTheme(ctx.ui.theme),
      theme: ctx.ui.theme,
      themeVersion: 1,
      hostname: safeHostname(),
      lastRateAt: 0,
    };
    this.runtime = runtime;
    runtime.store.subscribe(() => runtime.scheduler.requestThrottled());
    this.refreshData(ctx, runtime);

    const editorAvailable = this.config.shape === "native"
      ? ctx.ui.getEditorComponent() === undefined
      : this.installEditor(runtime);
    if (this.config.footerMode === "none") {
      if (editorAvailable) this.installEmptyFooter(runtime);
      else if (this.config.shape === "native") this.warnEditorConflict(ctx);
    }
    if (usesGit(this.config)) this.startGit(runtime);
    if (usesClockSegment(this.config)) {
      runtime.scheduler.requestNow();
    }
  }

  private stop(): void {
    const runtime = this.runtime;
    if (!runtime) return;
    this.runtime = undefined;
    runtime.store.dispose();
    runtime.scheduler.dispose();
    runtime.git?.dispose();
    clearInterval(runtime.pollTimer);
    const current = runtime.ctx.ui.getEditorComponent();
    if (runtime.factory && current === runtime.factory) {
      try {
        runtime.ctx.ui.setEditorComponent(undefined);
      } catch {
        // 宿主正在重置时恢复失败不阻断退出。
      }
    }
  }

  private warnEditorConflict(ctx: ExtensionContext): void {
    const message = "pi-prompt: 其他扩展已接管编辑器，拒绝覆盖编辑器或底栏；请先停用冲突扩展并重启。";
    if (this.notified.has(message)) return;
    this.notified.add(message);
    ctx.ui.notify(message, "warning");
  }

  private installEditor(runtime: Runtime): boolean {
    const ctx = runtime.ctx;
    const current = ctx.ui.getEditorComponent();
    if (current && !isOwnedFactory(current)) {
      this.warnEditorConflict(ctx);
      return false;
    }
    if (runtime.factory !== undefined && current === runtime.factory) return true;

    const factory: EditorFactoryFn = (tui, editorTheme, keybindings) => {
      runtime.tui = tui;
      return new BandEditor(tui, editorTheme, keybindings, {
        renderTitle: () => this.renderTitle(runtime),
        renderBands: (width) => this.renderBands(runtime, width),
        prefix: () => runtime.config.shape === "borderless"
          ? (runtime.config.icons === "ascii" ? "> " : "❯ ")
          : runtime.config.prefix,
        ascii: () => runtime.config.icons === "ascii",
      });
    };
    markFactory(factory);
    runtime.factory = factory;
    try {
      ctx.ui.setEditorComponent(factory);
    } catch {
      runtime.factory = undefined;
      return false;
    }
    return true;
  }

  private installEmptyFooter(runtime: Runtime): void {
    runtime.ctx.ui.setFooter((tui, _theme, footerData) => {
      runtime.footerData = footerData;
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
      return {
        render: () => [],
        invalidate() {},
        dispose: () => {
          unsubscribe();
          runtime.footerData = undefined;
        },
      };
    });
  }

  private startGit(runtime: Runtime): void {
    const exec: GitExec = async (args, options) => {
      const result = await this.pi.exec("git", [...args], {
        cwd: options.cwd,
        timeout: options.timeout,
        signal: options.signal,
      });
      return { stdout: result.stdout, code: result.code };
    };
    const provider = new GitProvider({
      cwd: runtime.ctx.cwd,
      exec,
      ttlMs: runtime.config.git.ttlMs,
      onUpdate: (status: GitStatus | undefined, stale: boolean) => {
        if (this.runtime !== runtime) return;
        runtime.store.update({ git: status ? toGitFacts(status, stale) : undefined });
        runtime.scheduler.requestThrottled();
      },
    });
    runtime.git = provider;
    provider.refresh(true);
    if (runtime.config.git.refresh === "poll") {
      runtime.pollTimer = setInterval(() => provider.refresh(true), runtime.config.git.pollIntervalMs);
    }
  }

  private refreshData(ctx: ExtensionContext, runtime: Runtime): void {
    const facts = runtime.store.get();
    const model = ctx.model
      ? {
          id: ctx.model.id,
          name: ctx.model.name,
          provider: ctx.model.provider,
          thinking: safeThinking(this.pi),
        }
      : undefined;
    runtime.store.update({
      session: {
        id: ctx.sessionManager.getSessionId(),
        name: ctx.sessionManager.getSessionName(),
        cwd: ctx.cwd,
      },
      model,
      usage: this.readUsage(ctx, facts),
      context: this.readContext(ctx),
    });
  }

  private readUsage(ctx: ExtensionContext, previous: PromptFacts): UsageFacts | undefined {
    try {
      const ledger = buildUsageLedger(ctx.sessionManager.getEntries());
      const totals = ledger.totals;
      return {
        input: totals.input,
        output: totals.output,
        cacheRead: totals.cacheRead,
        cacheWrite: totals.cacheWrite,
        totalTokens: totals.totalTokens,
        costTotal: totals.cost,
        costFromProvider: totals.costFromProvider,
        scope: "session_file",
      };
    } catch {
      return previous.usage;
    }
  }

  private readContext(ctx: ExtensionContext): ContextFacts {
    try {
      const usage = ctx.getContextUsage();
      if (!usage) return { quality: "unknown", capacity: ctx.model?.contextWindow };
      const unknown = usage.tokens === null || usage.percent === null;
      return {
        used: usage.tokens ?? undefined,
        capacity: usage.contextWindow,
        percent: usage.percent ?? undefined,
        quality: unknown ? "unknown" : "reported",
      };
    } catch {
      return { quality: "unknown", capacity: ctx.model?.contextWindow };
    }
  }

  private sampleRate(runtime: Runtime, message: { usage: { output: number } }): void {
    const now = Date.now();
    if (runtime.startedAt === undefined) {
      runtime.startedAt = now;
      runtime.store.update({ runtime: { phase: "running", durationMs: 0 } });
    }
    if (now - runtime.lastRateAt < 100) return;
    runtime.lastRateAt = now;
    const output = message.usage?.output ?? 0;
    const elapsed = now - (runtime.startedAt ?? now);
    const tokensPerSecond = output > 0 && elapsed >= 250 ? output / (elapsed / 1000) : undefined;
    runtime.store.update({ runtime: { phase: "running", durationMs: elapsed, tokensPerSecond } });
  }

  private ensureTheme(runtime: Runtime): void {
    const theme = runtime.ctx.ui.theme;
    if (runtime.theme === theme) return;
    runtime.theme = theme;
    runtime.uiTheme = fromPiTheme(theme);
    runtime.themeVersion++;
  }

  private renderTitle(runtime: Runtime): string {
    this.ensureTheme(runtime);
    const { name, cwd } = runtime.store.get().session;
    const clean = (value: string): string => sanitizeLine(value).replace(/[\r\n]+/g, " ").trim();
    const title = (name && clean(name)) || clean(homePath(cwd, process.env.HOME ?? process.env.USERPROFILE));
    return runtime.uiTheme.fg("muted", title || runtime.config.brand.text);
  }

  private renderBands(runtime: Runtime, width: number): { status: string; detail?: string | undefined } {
    this.ensureTheme(runtime);
    const facts = runtime.store.get();
    const statuses = runtime.footerData?.getExtensionStatuses();
    const statusesKey = statuses ? JSON.stringify([...statuses]) : "";
    const branch = facts.git?.branch ?? runtime.footerData?.getGitBranch() ?? undefined;
    const key = `${width}|${facts.revision}|${runtime.configRevision}|${runtime.themeVersion}|${branch ?? ""}|${statusesKey}`;
    if (runtime.bandCache?.key === key) return runtime.bandCache;

    const segments = buildBandSegments({
      facts: facts.git || !branch ? facts : { ...facts, git: { branch, stale: false } },
      config: runtime.config,
      theme: runtime.uiTheme,
      hostname: runtime.hostname,
      home: process.env.HOME ?? process.env.USERPROFILE,
      now: Date.now(),
      extensionStatuses: statuses,
    });
    const common = { width, separator: runtime.config.separator, theme: runtime.uiTheme };
    const status = layoutSegmentBar({
      ...common,
      left: segments.left,
      right: segments.right,
      ...(segments.gauge ? { gauge: segments.gauge } : {}),
    }).line;
    const detail = segments.detail ? layoutSegmentBar({ ...common, ...segments.detail }).line : undefined;
    const cached = {
      key,
      status: status.trim() ? status : runtime.uiTheme.fg("accent", runtime.config.brand.text),
      detail,
    };
    runtime.bandCache = cached;
    return cached;
  }

  private async command(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const [subcommand, value] = args.trim().split(/\s+/, 2);
    if (subcommand === undefined || subcommand.length === 0 || subcommand === "status") {
      this.notifyStatus(ctx);
      return;
    }
    if (subcommand === "refresh") {
      const runtime = this.runtime;
      if (!runtime) {
        ctx.ui.notify("pi-prompt: 当前没有活动会话。", "warning");
        return;
      }
      this.refreshData(ctx, runtime);
      runtime.git?.refresh(true);
      runtime.scheduler.requestNow();
      ctx.ui.notify("pi-prompt: 已刷新状态。", "info");
      return;
    }
    if (subcommand === "preset") {
      this.applyPreset(value, ctx);
      return;
    }
    ctx.ui.notify("用法: /prompt-ui [status|refresh|preset band|native|borderless]", "warning");
  }

  private applyPreset(target: string | undefined, ctx: ExtensionCommandContext): void {
    const shape = target === "band" || target === "native" || target === "borderless" ? target : undefined;
    if (!shape) {
      ctx.ui.notify("用法: /prompt-ui preset band|native|borderless", "warning");
      return;
    }
    const runtime = this.runtime;

    if (shape === "native") {
      const current = ctx.ui.getEditorComponent();
      if (current && !isOwnedFactory(current)) {
        ctx.ui.notify("pi-prompt: 编辑器已被其他扩展接管，拒绝切换。", "warning");
        return;
      }
      if (runtime && current === runtime.factory) {
        ctx.ui.setEditorComponent(undefined);
        runtime.factory = undefined;
      }
      this.config.shape = "native";
      ctx.ui.notify("pi-prompt: 已切到原生编辑器；底栏配置不变。", "info");
      return;
    }

    this.config.shape = shape;
    if (runtime) {
      runtime.configRevision++;
      if (!this.installEditor(runtime)) return;
      runtime.scheduler.requestNow();
    }
    ctx.ui.notify(`pi-prompt: 已切到 ${shape} 预设。`, "info");
  }

  private notifyStatus(ctx: ExtensionCommandContext): void {
    const runtime = this.runtime;
    const facts = runtime?.store.get();
    const lines: string[] = [];
    lines.push(`pi-prompt · owner=${runtime ? (runtime.factory ? "editor" : "none") : "inactive"} · mode=${ctx.mode}`);
    const footer = this.config.footerMode === "none" && !runtime?.footerData ? "none (未安装)" : this.config.footerMode;
    lines.push(`shape=${this.config.shape} · footer=${footer} · separator=${this.config.separator} · icons=${this.config.icons}`);
    lines.push(`config=${this.configPath} (${this.configSource})`);
    if (facts) {
      const model = facts.model ? `${facts.model.provider ?? "?"}/${facts.model.id}${facts.model.thinking ? ` ${facts.model.thinking}` : ""}` : "unknown";
      lines.push(`model=${model}`);
      lines.push(`session=${facts.session.name ?? facts.session.id ?? "?"} · cwd=${facts.session.cwd}`);
      const context = facts.context;
      lines.push(
        context
          ? `context=${context.percent === undefined ? "?" : `${Math.round(context.percent)}%`}/${formatCapacity(context.capacity) ?? "?"} (${context.quality})`
          : "context=unknown",
      );
      const usage = facts.usage;
      lines.push(
        usage
          ? `usage(session_file)=↑${formatTokens(usage.input ?? 0)} ↓${formatTokens(usage.output ?? 0)} R${formatTokens(usage.cacheRead ?? 0)} W${formatTokens(usage.cacheWrite ?? 0)} cost=${usage.costFromProvider ? "$" : "≈$"}${(usage.costTotal ?? 0).toFixed(3)}`
          : "usage=unknown",
      );
      lines.push(`runtime=${facts.runtime.phase}${facts.runtime.tokensPerSecond ? ` ${Math.round(facts.runtime.tokensPerSecond)}t/s` : ""}`);
      const branch = facts.git?.branch;
      lines.push(branch
        ? `git=${branch} staged=${facts.git?.staged ?? 0} unstaged=${facts.git?.unstaged ?? 0} untracked=${facts.git?.untracked ?? 0}`
        : "git=unavailable");
    }
    lines.push(`segments.left=[${this.config.segments.left.join(", ")}] right=[${this.config.segments.right.join(", ")}]`);
    if (this.config.footerMode === "none") {
      lines.push(`metaSegments=[${this.config.metaSegments.join(", ")}] · detailSegments=[${this.config.detailSegments.join(", ")}]`);
    }
    if (this.configErrors.length > 0) lines.push(`config-errors: ${this.configErrors.join("; ")}`);
    ctx.ui.notify(lines.join("\n"), "info");
  }
}

function safeHostname(): string | undefined {
  try {
    return osHostname() || undefined;
  } catch {
    return undefined;
  }
}

function safeThinking(pi: ExtensionAPI): string | undefined {
  try {
    return String(pi.getThinkingLevel());
  } catch {
    return undefined;
  }
}

export function createExtension(pi: ExtensionAPI): PromptExtension {
  const extension = new PromptExtension(pi);
  extension.register();
  return extension;
}
