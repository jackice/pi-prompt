import type { ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import { displayWidth } from "@jackice/pi-ui";
import { describe, expect, it } from "vitest";

import { EmptyFooter, PromptFooter } from "../../src/footer.ts";
import { defaultConfig, type PromptConfig } from "../../src/config.ts";
import { createFacts, type PromptFacts } from "../../src/status/facts.ts";

const theme = {
  fg: (_token: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const footerData = {
  getGitBranch: () => "develop",
  getExtensionStatuses: () => new Map<string, string>(),
  getAvailableProviderCount: () => 1,
  onBranchChange: () => () => {},
} as unknown as ReadonlyFooterDataProvider;

const facts: PromptFacts = {
  ...createFacts("/Users/jackice/dev/pi-prompt"),
  session: { cwd: "/Users/jackice/dev/pi-prompt", name: undefined, id: "s1" },
  model: { id: "gpt-6-luna", name: "GPT-6 Luna", provider: "openai-codex", thinking: "medium" },
  context: { used: 0, capacity: 272000, percent: 0, quality: "reported" },
  usage: {
    input: 1000,
    output: 200,
    cacheRead: 300,
    cacheWrite: 40,
    totalTokens: 1540,
    costTotal: 0.42,
    costFromProvider: true,
    scope: "session_file",
  },
};

function footer(config: PromptConfig, lines?: 1 | 2) {
  const resolved = lines ?? (config.footerMode === "compact" ? 1 : 2);
  return new PromptFooter(
    theme,
    { facts: () => facts, config: () => config },
    footerData,
    { lines: resolved },
  );
}

describe("PromptFooter", () => {
  it("replace 模式输出两行：路径/分支 + 统计/模型", () => {
    const config = { ...defaultConfig("replace"), cost: { enabled: true } };
    const rows = footer(config).render(100);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe("~/dev/pi-prompt (develop)");
    expect(rows[1]).toContain("↑1.0k");
    expect(rows[1]).toContain("$0.420");
    expect(rows[1]).toContain("0%/272K");
    expect(rows[1]).toContain("GPT-6 Luna medium");
  });

  it("compact 模式合并为一行并保留关键字段", () => {
    const config = defaultConfig("compact");
    const rows = footer(config).render(100);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("~/dev/pi-prompt (develop)");
    expect(rows[0]).toContain("0%/272K");
    expect(rows[0]).toContain("GPT-6 Luna medium");
    expect(rows[0]).toContain(" • ");
  });

  it("compact 在窄宽下截断且不超宽", () => {
    const rows = footer(defaultConfig("compact")).render(24);
    expect(rows).toHaveLength(1);
    expect(displayWidth(rows[0] ?? "")).toBeLessThanOrEqual(24);
  });

  it("cost 关闭或为零时省略成本", () => {
    const config = { ...defaultConfig("compact"), cost: { enabled: false } };
    expect(footer(config).render(100)[0]).not.toContain("$");
    const zero = {
      ...defaultConfig("compact"),
      cost: { enabled: true },
    };
    const rows = new PromptFooter(
      theme,
      { facts: () => ({ ...facts, usage: { costTotal: 0, costFromProvider: false, scope: "session_file" } }), config: () => zero },
      footerData,
      { lines: 1 },
    ).render(100);
    expect(rows[0]).not.toContain("$");
  });

  it("width<=0 返回空行", () => {
    expect(footer(defaultConfig("compact")).render(0)).toEqual([]);
  });

  it("hidden 模式使用零行 footer", () => {
    expect(new EmptyFooter().render()).toEqual([]);
  });
});
