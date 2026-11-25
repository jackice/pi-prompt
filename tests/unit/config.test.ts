import { describe, expect, it } from "vitest";

import { defaultConfig, resolveConfig, usesGit } from "../../src/config.ts";

describe("config", () => {
  it("native 默认只启用紧凑分段", () => {
    const config = defaultConfig("native");
    expect(config.shape).toBe("band");
    expect(config.footerMode).toBe("native");
    expect(config.segments.left).toEqual(["brand", "model"]);
    expect(config.segments.right).toEqual(["token_rate"]);
    expect(config.context.enabled).toBe(true);
    expect(config.git.enabled).toBe(false);
    expect(usesGit(config)).toBe(false);
  });

  it("none 接受可配置状态，默认不启动 Git", () => {
    const { config, hardError } = resolveConfig({ footerMode: "none" });
    expect(hardError).toBe(false);
    expect(config.footerMode).toBe("none");
    expect(config.metaSegments).toEqual([]);
    expect(usesGit(config)).toBe(false);
    expect(usesGit(resolveConfig({ footerMode: "none", detailSegments: ["git"] }).config)).toBe(true);
  });

  it.each(["hidden", "inline", "compact", "replace"])("旧模式 %s 明确报告迁移到 none", (footerMode) => {
    const { errors, hardError } = resolveConfig({ footerMode });
    expect(hardError).toBe(true);
    expect(errors.join(" ")).toContain(`footerMode=${footerMode}`);
    expect(errors.join(" ")).toContain('footerMode: "none"');
  });

  it("metaSegments 过滤未知、重复与 context", () => {
    const { config, errors, hardError } = resolveConfig({
      footerMode: "none",
      metaSegments: ["path", "nope", "path", "context", "cost"],
    });
    expect(hardError).toBe(false);
    expect(config.metaSegments).toEqual(["path", "cost"]);
    expect(errors.some((message) => message.includes("metaSegments 未知"))).toBe(true);
    expect(errors.some((message) => message.includes("metaSegments 重复"))).toBe(true);
  });

  it("显式覆盖 mode 默认", () => {
    const { config } = resolveConfig({
      footerMode: "none",
      segments: { left: ["brand"], right: ["time"] },
      git: { enabled: false },
    });
    expect(config.segments.left).toEqual(["brand"]);
    expect(config.segments.right).toEqual(["time"]);
    expect(config.git.enabled).toBe(false);
  });

  it("控制字符 prefix 是硬错误并回退默认", () => {
    const { config, errors, hardError } = resolveConfig({ prefix: "a\nb" });
    expect(hardError).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
    expect(config.prefix).toBe("╰─ ");
  });

  it("ASCII 模式拒绝非 ASCII prefix 与 brand", () => {
    const prefix = resolveConfig({ icons: "ascii", prefix: "❯ " });
    expect(prefix.hardError).toBe(true);
    const brand = resolveConfig({ icons: "ascii", brand: { text: "φ" } });
    expect(brand.hardError).toBe(true);
    expect(brand.config.brand.text).toBe("φ");
  });

  it("未知与重复 segment 只报告并忽略该 ID", () => {
    const { config, errors, hardError } = resolveConfig({
      segments: { left: ["brand", "nope", "brand"], right: ["model", "model"] },
    });
    expect(hardError).toBe(false);
    expect(config.segments.left).toEqual(["brand"]);
    expect(config.segments.right).toEqual(["model"]);
    expect(errors.some((message) => message.includes("未知 segment"))).toBe(true);
    expect(errors.some((message) => message.includes("重复 segment"))).toBe(true);
  });

  it("阈值顺序与范围校验", () => {
    expect(resolveConfig({ context: { warning: 90, critical: 70 } }).hardError).toBe(true);
    expect(resolveConfig({ context: { warning: -1 } }).hardError).toBe(true);
    expect(resolveConfig({ git: { pollIntervalMs: 100 } }).hardError).toBe(true);
  });

  it("非法枚举值被拒绝", () => {
    expect(resolveConfig({ shape: "unknown" }).hardError).toBe(true);
    expect(resolveConfig({ separator: "neon" }).hardError).toBe(true);
    expect(resolveConfig({ icons: "nerd" }).hardError).toBe(true);
    expect(resolveConfig({ footerMode: "custom" }).hardError).toBe(true);
  });

  it("合法自定义配置完整保留", () => {
    const { config, hardError } = resolveConfig({
      enabled: false,
      shape: "borderless",
      separator: "dot",
      prefix: "> ",
      icons: "ascii",
      brand: { text: "$" },
      segments: { left: ["hostname", "model"], right: ["token_in", "time"] },
      context: { enabled: false, style: "off", warning: 60, critical: 80 },
      git: { enabled: true, refresh: "manual", ttlMs: 9000, pollIntervalMs: 15000 },
      clock: { enabled: true },
      cost: { enabled: true },
    });
    expect(hardError).toBe(false);
    expect(config.shape).toBe("borderless");
    expect(config.segments.left).toEqual(["hostname", "model"]);
    expect(config.segments.right).toEqual(["token_in", "time"]);
    expect(config.context.enabled).toBe(false);
    expect(config.git.refresh).toBe("manual");
    expect(config.clock.enabled).toBe(true);
    expect(config.cost.enabled).toBe(true);
  });

  it("非对象根节点是硬错误", () => {
    expect(resolveConfig([]).hardError).toBe(true);
    expect(resolveConfig("x").hardError).toBe(true);
  });
});
