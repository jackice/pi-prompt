import { displayWidth } from "@jackice/pi-ui";
import { CURSOR_MARKER, stripTerminalSequences } from "@earendil-works/pi-tui";
import type { EditorTheme, TUI, TuiMouseEvent } from "@earendil-works/pi-tui";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { BandEditor } from "../../src/composer/native-editor.ts";

function createEditor(
  status = "φ > GPT high   2% ───────── 500K",
  rows = 24,
  prefix = "╰─ ",
  title: string | (() => string) = "~/dev/pi-prompt",
  detail?: string,
) {
  const tui = {
    mode: "fullscreen",
    terminal: { rows, columns: 80 },
    requestRender: () => {},
  } as unknown as TUI;
  const theme = {
    borderColor: (text: string) => text,
    selectList: {},
  } as unknown as EditorTheme;
  const keybindings = { matches: () => false } as unknown as KeybindingsManager;
  return new BandEditor(tui, theme, keybindings, {
    renderBands: () => ({ status, detail }),
    renderTitle: typeof title === "function" ? title : () => title,
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
    expect(rows[0]).toBe(`${" ".repeat(25)}~/dev/pi-prompt`);
    expect(rows[1]).toBe("φ > GPT high   2% ───────── 500K");
    expect(rows[2]?.startsWith("╰─ ")).toBe(true);
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

  it("详情仅在有内容时额外占一行，输入仍是最后一行", () => {
    const editor = createEditor("status", 24, "╰─ ", "Session title", "↑1K ↓500");
    editor.setText("draft");
    expect(editor.render(60).map((row) => stripTerminalSequences(row).trimEnd())).toEqual([
      `${" ".repeat(47)}Session title`, "status", "↑1K ↓500", "╰─ draft",
    ]);
    const result = editor.handleMouse(event({ x: 3, y: 2 }));
    expect(result).toEqual({ handled: true, focus: true });
    expect(editor.getCursor()).toEqual({ line: 0, col: 5 });
  });

  it("标题渲染异常或换行时回退原生 render", () => {
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

  it("标题和详情都不超出宿主宽度", () => {
    const editor = createEditor("status", 24, "╰─ ", "x".repeat(100), "y".repeat(100));
    editor.setText("x");
    const rows = editor.render(30);
    for (const row of rows) {
      expect(displayWidth(row)).toBeLessThanOrEqual(30);
    }
  });

  it("空详情不占行，输入下方没有固定空白", () => {
    const editor = createEditor("status", 24, "╰─ ", "~/dev/pi-prompt", "");
    editor.setText("hello");
    const rows = editor.render(40);
    expect(rows).toHaveLength(3);
    expect(stripTerminalSequences(rows[2] ?? "").trimEnd()).toBe("╰─ hello");
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
    const result = editor.handleMouse(event({ x: 6, y: 2 }));
    expect(result).toEqual({ handled: true, focus: true });
    expect(editor.getCursor()).toEqual({ line: 0, col: 3 });
  });

  it.each([
    { height: 3, screenY: 2 },
    { height: 4, screenY: 3 },
  ])("全屏裁剪顶部后可点击输入（height=$height）", ({ height, screenY }) => {
    const editor = createEditor("status", 4, "╰─ ", "Session title", "↑1K ↓500");
    editor.focused = true;
    editor.setText("hello world");
    editor.render(40);
    editor.handleMouse(event({ x: 6, y: 2, height, screenY }));
    expect(editor.getCursor()).toEqual({ line: 0, col: 3 });
  });

  it("点击前缀只聚焦，不移动正文光标", () => {
    const editor = createEditor();
    editor.setText("hello");
    editor.render(40);
    const result = editor.handleMouse(event({ x: 0, y: 2 }));
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
    expect(displayWidth(rows[1] ?? "")).toBeLessThanOrEqual(40);
  });
});
