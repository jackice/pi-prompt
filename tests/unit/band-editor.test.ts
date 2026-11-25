import { displayWidth } from "@jackice/pi-ui";
import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import type { EditorTheme, TUI, TuiMouseEvent } from "@earendil-works/pi-tui";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { BandEditor } from "../../src/composer/native-editor.ts";
import { resolveShape } from "../../src/composer/shapes.ts";
import { defaultConfig } from "../../src/config.ts";

const config = defaultConfig("native");
const shape = resolveShape(config);

function createEditor(
  status = "φ > GPT high   2% ───────── 500K",
  rows = 24,
  prefix = "╰─ ",
  meta?: string | (() => string),
) {
  const tui = {
    terminal: { rows, columns: 80 },
    requestRender: () => {},
  } as unknown as TUI;
  const theme = {
    borderColor: (text: string) => text,
    selectList: {},
  } as unknown as EditorTheme;
  const keybindings = { matches: () => false } as unknown as KeybindingsManager;
  return new BandEditor(tui, theme, keybindings, {
    renderStatus: () => status,
    ...(meta === undefined
      ? {}
      : { renderMeta: typeof meta === "function" ? meta : () => meta }),
    shape: () => ({ ...shape, firstPrefix: prefix }),
    prefix: () => prefix,
    ascii: () => false,
  });
}

function event(patch: Partial<TuiMouseEvent>): TuiMouseEvent {
  return {
    type: "click",
    button: "left",
    x: 0,
    y: 0,
    screenX: 0,
    screenY: 0,
    width: 40,
    height: 10,
    shift: false,
    alt: false,
    ctrl: false,
    ...patch,
  };
}

describe("BandEditor", () => {
  it("用状态行替换顶边、移除底边并保留输入文本", () => {
    const editor = createEditor();
    editor.setText("hello");
    const rows = editor.render(40);
    expect(rows[0]).toBe("φ > GPT high   2% ───────── 500K");
    expect(rows[1]?.startsWith("╰─ ")).toBe(true);
    expect(rows.join("\n")).toContain("hello");
    expect(rows.some((row) => row === "─".repeat(40))).toBe(false);
    expect(rows.some((row) => row.includes("\u0000pi-prompt"))).toBe(false);
    expect(editor.getText()).toBe("hello");
  });

  it("保留 CURSOR_MARKER 供宿主定位 IME 候选框", () => {
    const editor = createEditor();
    editor.focused = true;
    editor.setText("abc");
    const rows = editor.render(40);
    expect(rows.join("")).toContain(CURSOR_MARKER);
  });

  it("所有输出行不超过宿主宽度", () => {
    for (const width of [10, 20, 40, 80, 120]) {
      for (const padding of [0, 1, 2, 3]) {
        const editor = createEditor();
        editor.setPaddingX(padding);
        editor.setText("line one\nline two");
        const rows = editor.render(width);
        for (const row of rows) {
          expect(displayWidth(row)).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  it("meta 行占满 reserved 行，空闲共 3 行", () => {
    const editor = createEditor("status", 24, "╰─ ", "~/dev/pi-prompt (develop)");
    editor.setText("");
    const rows = editor.render(60);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe("status");
    expect(rows[1]?.startsWith("╰─")).toBe(true);
    expect(rows[2]).toBe("~/dev/pi-prompt (develop)");
    expect(editor.getFrame()?.mapping[2]?.kind).toBe("meta");
  });

  it("点击 meta 行只聚焦，不移动正文光标", () => {
    const editor = createEditor("status", 24, "╰─ ", "meta");
    editor.setText("hello");
    editor.render(40);
    const result = editor.handleMouse(event({ x: 3, y: 2 }));
    expect(result).toEqual({ handled: true, focus: true });
    expect(editor.getCursor()).toEqual({ line: 0, col: 5 });
  });

  it("meta 渲染异常或换行时回退原生 render", () => {
    const throwing = createEditor("status", 24, "╰─ ", () => {
      throw new Error("boom");
    });
    throwing.setText("x");
    expect(throwing.render(40)[0]).toBe("─".repeat(40));
    expect(throwing.getFrame()).toBeUndefined();

    const newline = createEditor("status", 24, "╰─ ", "line1\nline2");
    newline.setText("x");
    expect(newline.render(40)[0]).toBe("─".repeat(40));
  });

  it("meta 行不超出宿主宽度", () => {
    const editor = createEditor("status", 24, "╰─ ", "x".repeat(100));
    editor.setText("x");
    const rows = editor.render(30);
    for (const row of rows) {
      expect(displayWidth(row)).toBeLessThanOrEqual(30);
    }
  });

  it("无 meta 时保持 2 行", () => {
    const editor = createEditor();
    editor.setText("hello");
    expect(editor.render(40)).toHaveLength(2);
  });

  it("长草稿滚动时显示一行合并隐藏计数", () => {
    const editor = createEditor("status", 10);
    editor.setText(Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n"));
    const rows = editor.render(40);
    expect(rows.some((row) => /↑\d+ ↓\d+/.test(row))).toBe(true);
    expect(editor.getFrame()?.mapping.some((entry) => entry.kind === "scroll")).toBe(true);
  });

  it("鼠标输入行映射扣除前缀并转发原生坐标", () => {
    const editor = createEditor();
    editor.setText("hello world");
    editor.render(40);
    const result = editor.handleMouse(event({ x: 6, y: 1 }));
    expect(result).toEqual({ handled: true, focus: true });
    expect(editor.getCursor()).toEqual({ line: 0, col: 3 });
  });

  it("点击前缀只聚焦，不移动正文光标", () => {
    const editor = createEditor();
    editor.setText("hello");
    editor.render(40);
    const result = editor.handleMouse(event({ x: 0, y: 1 }));
    expect(result).toEqual({ handled: true, focus: true });
    expect(editor.getCursor()).toEqual({ line: 0, col: 5 });
  });

  it("点击状态行或 scroll 行不伪造输入事件", () => {
    const editor = createEditor("status", 10);
    editor.setText(Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n"));
    editor.render(40);
    expect(editor.handleMouse(event({ x: 3, y: 0 }))).toEqual({ handled: true, focus: true });
    const frame = editor.getFrame();
    const scrollIndex = frame?.mapping.findIndex((entry) => entry.kind === "scroll") ?? -1;
    expect(scrollIndex).toBeGreaterThan(0);
    expect(editor.handleMouse(event({ x: 3, y: scrollIndex }))).toEqual({ handled: true, focus: true });
  });

  it("无有效前缀或非整数宽度时回退原生 render", () => {
    const widthTwo = createEditor();
    widthTwo.setText("x");
    const rows = widthTwo.render(2);
    expect(rows[0]).toBe("──");
    expect(widthTwo.getFrame()).toBeUndefined();

    const fractional = createEditor();
    fractional.setText("x");
    const fallback = fractional.render(40.5);
    expect(fallback[0]).toBe("─".repeat(40));
  });

  it("状态行超宽时被安全截断", () => {
    const editor = createEditor("x".repeat(200));
    editor.setText("a");
    const rows = editor.render(40);
    expect(displayWidth(rows[0] ?? "")).toBeLessThanOrEqual(40);
  });
});
