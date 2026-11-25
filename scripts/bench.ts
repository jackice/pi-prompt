import { hostname } from "node:os";

import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { fromPiTheme, layoutSegmentBar, plainTheme } from "@jackice/pi-ui";

import { BandEditor } from "../src/composer/native-editor.ts";
import { defaultConfig } from "../src/config.ts";
import { buildBandSegments } from "../src/segments.ts";
import { createFacts, type PromptFacts } from "../src/status/facts.ts";
import { formatTokens } from "../src/status/usage.ts";

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[index] ?? 0;
}

function measure(label: string, iterations: number, run: () => void): void {
  for (let index = 0; index < 50; index++) run();
  const samples: number[] = [];
  for (let index = 0; index < iterations; index++) {
    const start = process.hrtime.bigint();
    run();
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  const median = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const max = Math.max(...samples);
  console.log(`${label}: median=${median.toFixed(3)}ms p95=${p95.toFixed(3)}ms max=${max.toFixed(3)}ms n=${iterations}`);
}

const facts: PromptFacts = {
  ...createFacts("/Users/jackice/dev/src/github.com/jackice/pi-prompt"),
  model: { id: "gpt-6.2", name: "GPT-6.2", provider: "openai", thinking: "high" },
  context: { used: 10000, capacity: 500000, percent: 2, quality: "reported" },
  usage: { input: 18200, output: 4600, cacheRead: 219000, cacheWrite: 1200, totalTokens: 243000, costTotal: 0.42, costFromProvider: true, scope: "session_file" },
  git: { branch: "develop", staged: 1, unstaged: 2, untracked: 0, conflicts: 0, stale: false },
  runtime: { phase: "running", tokensPerSecond: 41 },
};
const config = defaultConfig("native");
const theme = plainTheme();

measure("status band (build + layout)", 2000, () => {
  const segments = buildBandSegments({
    facts,
    config: { ...config, segments: { left: ["brand", "model", "path", "git"], right: ["token_in", "token_out", "cache_read", "token_rate"] } },
    theme,
    hostname: hostname(),
    home: process.env.HOME,
    now: Date.now(),
  });
  layoutSegmentBar({
    width: 100,
    left: segments.left,
    right: segments.right,
    ...(segments.gauge ? { gauge: segments.gauge } : {}),
    separator: config.separator,
    theme,
  });
});

measure("status band (default native compact)", 2000, () => {
  const segments = buildBandSegments({
    facts,
    config,
    theme,
    hostname: hostname(),
    home: process.env.HOME,
    now: Date.now(),
  });
  layoutSegmentBar({
    width: 100,
    left: segments.left,
    right: segments.right,
    ...(segments.gauge ? { gauge: segments.gauge } : {}),
    separator: config.separator,
    theme,
  });
});

const tui = {
  terminal: { rows: 24, columns: 100 },
  requestRender: () => {},
} as unknown as TUI;
const editorTheme = { borderColor: (text: string) => text, selectList: {} } as unknown as EditorTheme;
const keybindings = { matches: () => false } as unknown as KeybindingsManager;
const editor = new BandEditor(tui, editorTheme, keybindings, {
  renderTitle: () => "~/dev/src/github.com/jackice/pi-prompt",
  renderBands: () => ({ status: `φ > GPT-6.2 high  2% ${"─".repeat(60)} 500K  ${formatTokens(41000)}t/s` }),
  prefix: () => config.prefix,
  ascii: () => false,
});
editor.setText(Array.from({ length: 20 }, (_, index) => `draft line ${index}`).join("\n"));
measure("BandEditor.render (24 rows, scrolled draft)", 1000, () => {
  editor.render(100);
});

console.log(`theme=${fromPiTheme({ fg: (_token, text) => text, bold: (text) => text }).fg("text", "plain")}`);
