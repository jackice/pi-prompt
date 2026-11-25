import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { buildUsageLedger, formatCapacity, formatTokens } from "../../src/status/usage.ts";

function usage(input: number, output: number, cacheRead = 0, cacheWrite = 0, total?: number, fromProvider = true) {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: total ?? input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.5, totalFromProvider: fromProvider },
  };
}

function entry(value: Record<string, unknown>): SessionEntry {
  return { id: `e${Math.random()}`, parentId: null, timestamp: "2026-01-01T00:00:00.000Z", ...value } as unknown as SessionEntry;
}

describe("usage ledger", () => {
  it("累计原生 Footer 的五类 usage entry", () => {
    const entries = [
      entry({ type: "usage", kind: "cache_warm", provider: "p", model: "m", usage: usage(10, 0) }),
      entry({ type: "message", message: { role: "assistant", usage: usage(100, 50, 20, 5) } }),
      entry({ type: "message", message: { role: "toolResult", usage: usage(7, 0) } }),
      entry({ type: "compaction", summary: "s", firstKeptEntryId: "x", tokensBefore: 1, usage: usage(3, 2) }),
      entry({ type: "branch_summary", fromId: "x", summary: "s", usage: usage(4, 1) }),
      entry({ type: "message", message: { role: "user", content: [] } }),
    ];
    const ledger = buildUsageLedger(entries);
    expect(ledger.totals.input).toBe(124);
    expect(ledger.totals.output).toBe(53);
    expect(ledger.totals.cacheRead).toBe(20);
    expect(ledger.totals.cacheWrite).toBe(5);
    expect(ledger.totals.totalTokens).toBe(202);
    expect(ledger.totals.cost).toBeCloseTo(2.5);
    expect(ledger.totals.costFromProvider).toBe(true);
    expect(ledger.entryCount).toBe(6);
  });

  it("CH% 取最后一条 assistant 的缓存命中率", () => {
    const entries = [
      entry({ type: "message", message: { role: "assistant", usage: usage(10, 0, 90) } }),
      entry({ type: "message", message: { role: "assistant", usage: usage(50, 0, 50) } }),
    ];
    const ledger = buildUsageLedger(entries);
    expect(ledger.latestCacheHitRate).toBeCloseTo(50);
  });

  it("最后一条 assistant 分母为零时 CH% 为 unknown", () => {
    const entries = [
      entry({ type: "message", message: { role: "assistant", usage: usage(10, 0, 90) } }),
      entry({ type: "message", message: { role: "assistant", usage: usage(0, 0, 0) } }),
    ];
    expect(buildUsageLedger(entries).latestCacheHitRate).toBeUndefined();
  });

  it("任意分项为估算时整笔成本不标记为 provider 计费", () => {
    const entries = [
      entry({ type: "usage", kind: "k", provider: "p", model: "m", usage: usage(1, 1, 0, 0, undefined, true) }),
      entry({ type: "usage", kind: "k", provider: "p", model: "m", usage: usage(1, 1, 0, 0, undefined, false) }),
    ];
    expect(buildUsageLedger(entries).totals.costFromProvider).toBe(false);
  });

  it("缺失 totalTokens 时按四项求和", () => {
    const entries = [
      entry({
        type: "usage",
        kind: "k",
        provider: "p",
        model: "m",
        usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost: { total: 0, totalFromProvider: true } },
      }),
    ];
    expect(buildUsageLedger(entries).totals.totalTokens).toBe(10);
  });

  it("空 entries 不造出非零累计", () => {
    const ledger = buildUsageLedger([]);
    expect(ledger.totals).toMatchObject({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 });
    expect(ledger.latestCacheHitRate).toBeUndefined();
  });

  it("token 与容量格式化遵循紧凑规则", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(18200)).toBe("18k");
    expect(formatTokens(219000)).toBe("219k");
    expect(formatTokens(4600000)).toBe("4.6M");
    expect(formatCapacity(500000)).toBe("500K");
    expect(formatCapacity(1000000)).toBe("1M");
    expect(formatCapacity(undefined)).toBeUndefined();
  });
});
