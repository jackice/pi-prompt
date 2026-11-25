import { describe, expect, it, vi } from "vitest";

import { RenderScheduler } from "../../src/status/scheduler.ts";
import { PromptStore } from "../../src/status/store.ts";

describe("PromptStore", () => {
  it("相同值不增加 revision，也不通知", () => {
    const store = new PromptStore("/tmp");
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.get().revision;
    expect(store.update({ session: { cwd: "/tmp" } })).toBe(false);
    expect(store.get().revision).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("变化时递增 revision 并通知", () => {
    const store = new PromptStore("/tmp");
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.get().revision;
    expect(store.update({ model: { id: "m", name: "M" } })).toBe(true);
    expect(store.get().revision).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("bumpGeneration 使异步快照失效", () => {
    const store = new PromptStore("/tmp", 2);
    store.bumpGeneration();
    expect(store.get().generation).toBe(3);
  });

  it("清除模型时模型变为 undefined", () => {
    const store = new PromptStore("/tmp");
    store.update({ model: { id: "m" } });
    store.update({ model: undefined });
    expect(store.get().model).toBeUndefined();
  });
});

describe("RenderScheduler", () => {
  it("合并高频请求，最多 10Hz", () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn();
      const scheduler = new RenderScheduler(request, 100);
      scheduler.requestThrottled();
      scheduler.requestThrottled();
      scheduler.requestThrottled();
      expect(request).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(request).toHaveBeenCalledTimes(1);
      scheduler.requestThrottled();
      vi.advanceTimersByTime(100);
      expect(request).toHaveBeenCalledTimes(2);
      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("立即请求会取消挂起的 trailing 定时器", () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn();
      const scheduler = new RenderScheduler(request, 100);
      scheduler.requestThrottled();
      scheduler.requestNow();
      expect(request).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(200);
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
