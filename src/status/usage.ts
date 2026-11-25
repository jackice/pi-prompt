import type { SessionEntry } from "@earendil-works/pi-coding-agent";

interface UsageLike {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens?: number;
  cost: { total: number; totalFromProvider?: boolean };
}

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  totalTokens: number;
  /** 仅在出现过 usage 且全部分项都由 provider 报告时为 true。 */
  costFromProvider: boolean;
  parts: number;
}

export interface UsageLedger {
  totals: UsageTotals;
  latestCacheHitRate?: number | undefined;
  entryCount: number;
}

export function emptyUsageTotals(): UsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    totalTokens: 0,
    costFromProvider: false,
    parts: 0,
  };
}

export function addUsage(totals: UsageTotals, usage: UsageLike): void {
  const totalTokens = Number.isFinite(usage.totalTokens)
    ? (usage.totalTokens as number)
    : usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  totals.input += usage.input;
  totals.output += usage.output;
  totals.cacheRead += usage.cacheRead;
  totals.cacheWrite += usage.cacheWrite;
  totals.cost += usage.cost.total;
  totals.totalTokens += totalTokens;
  totals.parts += 1;
  totals.costFromProvider = totals.parts === 1
    ? usage.cost.totalFromProvider === true
    : totals.costFromProvider && usage.cost.totalFromProvider === true;
}

/** 与 Pi 1.6.0 原生 Footer 相同的全文件、五类 entry 累计口径。 */
export function buildUsageLedger(entries: readonly SessionEntry[]): UsageLedger {
  const totals = emptyUsageTotals();
  let latestCacheHitRate: number | undefined;

  for (const entry of entries) {
    if (entry.type === "usage") {
      addUsage(totals, entry.usage);
      continue;
    }
    if (entry.type === "message") {
      if (entry.message.role === "assistant") {
        addUsage(totals, entry.message.usage);
        const promptTokens = entry.message.usage.input + entry.message.usage.cacheRead + entry.message.usage.cacheWrite;
        latestCacheHitRate = promptTokens > 0 ? (entry.message.usage.cacheRead / promptTokens) * 100 : undefined;
      } else if (entry.message.role === "toolResult" && entry.message.usage) {
        addUsage(totals, entry.message.usage);
      }
      continue;
    }
    if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
      addUsage(totals, entry.usage);
    }
  }

  return { totals, latestCacheHitRate, entryCount: entries.length };
}

export function formatTokens(count: number): string {
  if (!Number.isFinite(count)) return "?";
  if (count < 1000) return Math.max(0, Math.round(count)).toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

export function formatCapacity(tokens: number | undefined): string | undefined {
  if (tokens === undefined || !Number.isFinite(tokens) || tokens <= 0) return undefined;
  if (tokens < 1000) return `${Math.round(tokens)}`;
  if (tokens < 1000000) {
    const value = tokens / 1000;
    return `${Number.isInteger(value) ? value : value.toFixed(0)}K`;
  }
  const value = tokens / 1000000;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}M`;
}
