import { describe, expect, it } from "vitest";

import { choosePrefix, composeFrame } from "../../src/composer/frame.ts";
import { resolveShape } from "../../src/composer/shapes.ts";
import { defaultConfig } from "../../src/config.ts";

const band = resolveShape(defaultConfig("native"));

function capture(inputs: string[], completions: string[] = [], topHidden = 0, bottomHidden = 0) {
  return { inputs, completions, topHidden, bottomHidden, height: inputs.length + completions.length + 2 };
}

describe("choosePrefix", () => {
  it("正常宽度使用完整前缀并扣除原生宽度", () => {
    expect(choosePrefix(80, 0, ["╰─ "])).toEqual({ prefix: "╰─ ", width: 3, nativeWidth: 77 });
  });

  it("尊重宿主 padding", () => {
    const choice = choosePrefix(80, 3, ["╰─ "]);
    expect(choice?.nativeWidth).toBe(77);
    const padding = Math.min(3, Math.max(0, Math.floor((77 - 1) / 2)));
    expect(padding).toBe(3);
  });

  it("窄宽依次降级到单列与空前缀", () => {
    expect(choosePrefix(3, 0, ["╰─ ", ">", ""])?.prefix).toBe("");
    expect(choosePrefix(2, 0, ["╰─ ", ">", ""])).toBeUndefined();
  });

  it("非法宽度直接拒绝", () => {
    expect(choosePrefix(1, 0, ["╰─ "])).toBeUndefined();
    expect(choosePrefix(Number.NaN, 0, ["╰─ "])).toBeUndefined();
    expect(choosePrefix(80.5, 0, ["╰─ "])).toBeUndefined();
  });

  it("去重候选且不返回重复前缀", () => {
    expect(choosePrefix(80, 0, [">", ">", ""])).toEqual({ prefix: ">", width: 1, nativeWidth: 79 });
  });
});

describe("composeFrame", () => {
  it("band：状态行在上，前缀只在首输入行，补全保留", () => {
    const frame = composeFrame({
      width: 40,
      shape: band,
      prefix: "╰─ ",
      prefixWidth: 3,
      status: "φ > GPT high",
      capture: capture(["hello", "world"], ["completion"]),
      ascii: false,
    });
    expect(frame).toBeDefined();
    expect(frame?.rows).toEqual([
      "φ > GPT high",
      "╰─ hello",
      "   world",
      "   completion",
    ]);
    expect(frame?.mapping.map((row) => row.kind)).toEqual(["status", "input", "input", "completion"]);
    expect(frame?.mapping[1]).toEqual({ kind: "input", nativeY: 1, xOffset: 3 });
    expect(frame?.mapping[2]).toEqual({ kind: "input", nativeY: 2, xOffset: 3 });
    expect(frame?.mapping[3]).toEqual({ kind: "completion", nativeY: 4, xOffset: 3 });
    expect(frame?.nativeHeight).toBe(5);
  });

  it("有隐藏行时插入一行 scroll，且补全 nativeY 随之下移", () => {
    const frame = composeFrame({
      width: 40,
      shape: band,
      prefix: "╰─ ",
      prefixWidth: 3,
      status: "status",
      capture: capture(["input"], ["done"], 3, 5),
      ascii: false,
    });
    expect(frame?.rows[2]).toBe("   ↑3 ↓5");
    expect(frame?.mapping[2]?.kind).toBe("scroll");
    expect(frame?.mapping[3]).toEqual({ kind: "completion", nativeY: 3, xOffset: 3 });
  });

  it("ASCII 使用 up/down 文本", () => {
    const frame = composeFrame({
      width: 40,
      shape: band,
      prefix: "> ",
      prefixWidth: 2,
      status: "status",
      capture: capture(["x"], [], 0, 1),
      ascii: true,
    });
    expect(frame?.rows[2]).toBe("  up:0 down:1");
  });

  it("borderless 状态行在输入下方", () => {
    const shape = resolveShape({ ...defaultConfig("native"), shape: "borderless" });
    const frame = composeFrame({
      width: 40,
      shape,
      prefix: "❯ ",
      prefixWidth: 2,
      status: "status",
      capture: capture(["hi"], ["comp"]),
      ascii: false,
    });
    expect(frame?.rows).toEqual(["❯ hi", "status", "  comp"]);
    expect(frame?.mapping.map((row) => row.kind)).toEqual(["input", "status", "completion"]);
  });

  it("scroll 提示放不下时整帧回退", () => {
    const frame = composeFrame({
      width: 4,
      shape: band,
      prefix: "",
      prefixWidth: 0,
      status: "s",
      capture: capture(["x"], [], 12345, 67890),
      ascii: false,
    });
    expect(frame).toBeUndefined();
  });

  it("任何行超宽都返回 undefined 而不是裁剪", () => {
    const frame = composeFrame({
      width: 8,
      shape: band,
      prefix: "",
      prefixWidth: 0,
      status: "ok",
      capture: capture(["123456789"]),
      ascii: false,
    });
    expect(frame).toBeUndefined();
  });

  it("无输入行视为无效捕获", () => {
    const frame = composeFrame({
      width: 20,
      shape: band,
      prefix: "",
      prefixWidth: 0,
      status: "ok",
      capture: capture([]),
      ascii: false,
    });
    expect(frame).toBeUndefined();
  });
});
