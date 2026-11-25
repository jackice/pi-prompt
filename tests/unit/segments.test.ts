import { plainTheme } from "@jackice/pi-ui";
import { describe, expect, it } from "vitest";

import { defaultConfig, type PromptConfig } from "../../src/config.ts";
import { buildBandSegments } from "../../src/segments.ts";
import { createFacts, type PromptFacts } from "../../src/status/facts.ts";

function facts(patch: Partial<PromptFacts> = {}): PromptFacts {
  return { ...createFacts("/Users/jackice/dev/pi"), ...patch };
}

const base = {
  config: defaultConfig("native"),
  theme: plainTheme(),
  home: "/Users/jackice",
  now: Date.UTC(2026, 0, 1, 9, 30),
};

function makeConfig(patch: Partial<PromptConfig>): PromptConfig {
  return { ...base.config, ...patch };
}

function build(config: PromptConfig, promptFacts: PromptFacts, statuses?: ReadonlyMap<string, string>) {
  return buildBandSegments({
    ...base,
    config,
    facts: promptFacts,
    ...(statuses ? { extensionStatuses: statuses } : {}),
  });
}

describe("band segments", () => {
  it("native 默认只产出 brand/model 与 context gauge", () => {
    const built = build(base.config, facts({
      model: { id: "gpt-6.2", name: "GPT-6.2", provider: "openai", thinking: "high" },
      context: { percent: 2, capacity: 500000, quality: "reported" },
    }));
    expect(built.left.map((segment) => segment.id)).toEqual(["brand", "model"]);
    expect(built.right).toEqual([]);
    expect(built.gauge).toBeDefined();
    expect(built.left[1]?.full.text).toBe("GPT-6.2 high");
  });

  it("context unknown 显示 ? 而不伪造百分比", () => {
    const built = build(base.config, facts({ context: { quality: "unknown", capacity: 500000 } }));
    const line = built.gauge?.render(20) ?? "";
    expect(line).toContain("?");
    expect(line).toContain("500K");
  });

  it("token_rate 只在可信 live 速率时出现", () => {
    const config = makeConfig({ segments: { left: [], right: ["token_rate"] } });
    const idle = build(config, facts({ runtime: { phase: "idle", tokensPerSecond: 41 } }));
    expect(idle.right).toEqual([]);
    const running = build(config, facts({ runtime: { phase: "running", tokensPerSecond: 41.4 } }));
    expect(running.right[0]?.full.text).toBe("41t/s");
    const zero = build(config, facts({ runtime: { phase: "running", tokensPerSecond: 0 } }));
    expect(zero.right).toEqual([]);
  });

  it("usage 为零时隐藏 token 段", () => {
    const config = makeConfig({ segments: { left: [], right: ["token_in", "token_out"] } });
    const zero = build(config, facts({ usage: { input: 0, output: 0, scope: "session_file" } }));
    expect(zero.right).toEqual([]);
    const nonZero = build(config, facts({ usage: { input: 18200, output: 4600, scope: "session_file" } }));
    expect(nonZero.right.map((segment) => segment.full.text)).toEqual(["↑18k", "↓4.6k"]);
  });

  it("成本区分 provider 计费与目录估算", () => {
    const config = makeConfig({ segments: { left: [], right: ["cost"] } });
    const billed = build(config, facts({ usage: { costTotal: 0.125, costFromProvider: true, scope: "session_file" } }));
    expect(billed.right[0]?.full.text).toBe("$0.125");
    const estimate = build(config, facts({ usage: { costTotal: 0.125, costFromProvider: false, scope: "session_file" } }));
    expect(estimate.right[0]?.full.text).toBe("≈$0.125");
  });

  it("Git 段只在有分支时出现，dirty 使用 warning", () => {
    const config = makeConfig({ segments: { left: ["git"], right: [] } });
    const none = build(config, facts());
    expect(none.left).toEqual([]);
    const dirty = build(config, facts({ git: { branch: "develop", staged: 1, unstaged: 2, untracked: 0, stale: false } }));
    expect(dirty.left[0]?.full.text).toBe("develop*");
    expect(dirty.left[0]?.full.tone).toBe("warning");
    const clean = build(config, facts({ git: { branch: "develop", staged: 0, unstaged: 0, untracked: 0, stale: false } }));
    expect(clean.left[0]?.full.text).toBe("develop");
    expect(clean.left[0]?.full.tone).toBe("muted");
  });

  it("path 使用 ~ 且提供 compact/min", () => {
    const config = makeConfig({ segments: { left: ["path"], right: [] } });
    const built = build(config, facts({ session: { cwd: "/Users/jackice/dev/pi-prompt", id: "s1" } }));
    expect(built.left[0]?.full.text).toBe("~/dev/pi-prompt");
    expect(built.left[0]?.compact?.text).toBe("pi-prompt");
    expect(built.left[0]?.min?.text).not.toBe(built.left[0]?.full.text);
  });

  it("ASCII 使用可读 token 标签", () => {
    const config = makeConfig({ icons: "ascii", segments: { left: [], right: ["token_in", "cache_read"] } });
    const built = build(config, facts({ usage: { input: 1000, cacheRead: 2000, scope: "session_file" } }));
    expect(built.right.map((segment) => segment.full.text)).toEqual(["in 1.0k", "read 2.0k"]);
  });

  it("扩展状态映射消费专用 key 且聚合其余状态", () => {
    const config = makeConfig({
      segments: { left: [], right: ["workflow", "subagents", "extension_statuses"] },
      extensionStatusKeys: { workflow: "jackice:workflow", subagents: "jackice:subagents" },
    });
    const built = build(config, facts(), new Map([
      ["jackice:workflow", "plan"],
      ["jackice:subagents", "2 agents"],
      ["todo", "3/5"],
    ]));
    expect(built.right[0]?.full.text).toBe("plan");
    expect(built.right[1]?.full.text).toBe("2 agents");
    expect(built.right[2]?.full.text).toBe("todo: 3/5");
  });

  it("session 使用名称，否则使用短 ID", () => {
    const config = makeConfig({ segments: { left: ["session"], right: [] } });
    const named = build(config, facts({ session: { cwd: "/x", name: "status band", id: "abcdef123456" } }));
    expect(named.left[0]?.full.text).toBe("status band");
    const unnamed = build(config, facts({ session: { cwd: "/x", id: "abcdef123456" } }));
    expect(unnamed.left[0]?.full.text).toBe("session abcdef12");
  });

  it("time 段仅在显式配置或 clock 启用时出现", () => {
    const hidden = build(base.config, facts());
    expect(hidden.left.some((segment) => segment.id === "time")).toBe(false);
    expect(hidden.right.some((segment) => segment.id === "time")).toBe(false);
    const clock = build(makeConfig({ clock: { enabled: true } }), facts());
    expect(clock.right[0]?.id).toBe("time");
    expect(clock.right[0]?.full.text).toMatch(/^\d{2}:\d{2}$/);
    const explicit = build(makeConfig({ segments: { left: ["time"], right: [] } }), facts());
    expect(explicit.left[0]?.id).toBe("time");
  });
});
