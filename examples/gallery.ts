import { hostname } from "node:os";

import { fromPiTheme, layoutSegmentBar } from "@jackice/pi-ui";

import { defaultConfig, type PromptConfig } from "../src/config.ts";
import { buildBandSegments } from "../src/segments.ts";
import { createFacts, type PromptFacts } from "../src/status/facts.ts";

const theme = fromPiTheme({ fg: (_token, text) => text, bold: (text) => text });

function fixture(): PromptFacts {
  return {
    ...createFacts("/Users/jackice/dev/pi-prompt", 1),
    model: { id: "gpt-6.2", name: "GPT-6.2", provider: "openai", thinking: "high" },
    context: { used: 10000, capacity: 500000, percent: 2, quality: "reported" },
    usage: {
      input: 18200,
      output: 4600,
      cacheRead: 219000,
      cacheWrite: 1200,
      totalTokens: 243000,
      costTotal: 0.42,
      costFromProvider: true,
      scope: "session_file",
    },
    git: { branch: "develop", staged: 1, unstaged: 2, untracked: 0, conflicts: 0, stale: false },
    runtime: { phase: "running", tokensPerSecond: 41 },
  };
}

function render(config: PromptConfig, width: number, facts: PromptFacts): string {
  const segments = buildBandSegments({
    facts,
    config,
    theme,
    hostname: hostname(),
    home: process.env.HOME,
    now: Date.UTC(2026, 0, 1, 9, 30),
  });
  return layoutSegmentBar({
    width,
    left: segments.left,
    right: segments.right,
    ...(segments.gauge ? { gauge: segments.gauge } : {}),
    separator: config.separator,
    theme,
  }).line;
}

for (const width of [40, 80, 120]) {
  console.log(`\nwidth=${width} native compact`);
  console.log(render(defaultConfig("native"), width, fixture()));
}

const withNavigation: PromptConfig = {
  ...defaultConfig("none"),
  metaSegments: ["path", "git", "session", "cost"],
  cost: { enabled: true },
};
console.log("\nwidth=120 no footer, with navigation");
console.log(render(withNavigation, 120, fixture()));

console.log("\nwidth=120 idle (no usage, unknown context)");
console.log(
  render(withNavigation, 120, {
    ...createFacts("/Users/jackice/dev/pi-prompt", 1),
    context: { quality: "unknown", capacity: 500000 },
  }),
);

console.log("\nwidth=60 ascii");
console.log(
  render(
    {
      ...defaultConfig("native"),
      icons: "ascii",
      prefix: "> ",
      brand: { text: "pi" },
      segments: { left: ["brand", "model"], right: ["token_in", "token_rate"] },
    },
    60,
    fixture(),
  ),
);
