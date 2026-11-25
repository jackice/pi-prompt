import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, type EditorTheme, type TuiMouseEvent, type TuiMouseEventResult, type TUI } from "@earendil-works/pi-tui";
import { displayWidth } from "@jackice/pi-ui";

import { alignHeading, choosePrefix, composeFrame, type FrameResult } from "./frame.ts";

export interface BandEditorSource {
  renderTitle(): string;
  renderBands(width: number): { status: string; detail?: string | undefined };
  prefix(): string;
  ascii(): boolean;
}

interface CaptureState {
  topToken: string;
  bottomToken: string;
  topHidden: number;
  bottomHidden: number;
}

type WorkingStatus = Parameters<CustomEditor["setWorkingStatusIndicator"]>[0];

let tokenCounter = 0;

function nextToken(kind: string): string {
  tokenCounter++;
  return `\u0000pi-prompt:${kind}:${tokenCounter}:${Math.random().toString(36).slice(2, 10)}\u0000`;
}

export class BandEditor extends CustomEditor {
  private capture: CaptureState | undefined;
  private lastFrame: FrameResult | undefined;
  private workingStatus: WorkingStatus;
  private readonly source: BandEditorSource;

  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, source: BandEditorSource) {
    super(tui, theme, keybindings, { embedWorkingStatus: true });
    this.source = source;
  }

  getFrame(): FrameResult | undefined {
    return this.lastFrame;
  }

  override setWorkingStatusIndicator(indicator: WorkingStatus): void {
    super.setWorkingStatusIndicator(indicator);
    this.workingStatus = indicator;
  }

  private renderHeading(title: string, width: number): string {
    if (!this.workingStatus) return title;
    const working = this.workingStatus.renderInBorder(width);
    return displayWidth(working) > 0 ? alignHeading(working, title, width) : title;
  }

  protected override renderTopBorder(width: number, hiddenLineCount: number): string {
    if (this.capture) {
      this.capture.topHidden = hiddenLineCount;
      return this.capture.topToken;
    }
    return super.renderTopBorder(width, hiddenLineCount);
  }

  protected override renderBottomBorder(width: number, hiddenLineCount: number): string {
    if (this.capture) {
      this.capture.bottomHidden = hiddenLineCount;
      return this.capture.bottomToken;
    }
    return super.renderBottomBorder(width, hiddenLineCount);
  }

  override render(width: number): string[] {
    this.lastFrame = undefined;
    const choice = choosePrefix(width, this.getPaddingX(), [this.source.prefix(), ">", ""]);
    if (!choice) {
      return super.render(width);
    }

    const capture: CaptureState = {
      topToken: nextToken("top"),
      bottomToken: nextToken("bottom"),
      topHidden: 0,
      bottomHidden: 0,
    };
    this.capture = capture;
    let lines: string[];
    try {
      lines = super.render(choice.nativeWidth);
    } finally {
      this.capture = undefined;
    }

    const topIndex = lines.findIndex((line) => line === capture.topToken);
    const bottomIndex = lines.findIndex((line) => line === capture.bottomToken);
    const topCount = lines.filter((line) => line === capture.topToken).length;
    const bottomCount = lines.filter((line) => line === capture.bottomToken).length;
    if (topIndex !== 0 || bottomIndex <= 1 || topCount !== 1 || bottomCount !== 1) {
      return super.render(width);
    }

    const inputs = lines.slice(1, bottomIndex);
    const completions = lines.slice(bottomIndex + 1);
    if (inputs.length === 0) return super.render(width);

    let heading: string;
    let status: string;
    let detail: string | undefined;
    try {
      heading = this.renderHeading(this.source.renderTitle(), width);
      ({ status, detail } = this.source.renderBands(width));
    } catch {
      return super.render(width);
    }
    if (/[\r\n]/.test(heading) || /[\r\n]/.test(status) || (detail !== undefined && /[\r\n]/.test(detail))) {
      return super.render(width);
    }

    const frame = composeFrame({
      width,
      prefix: choice.prefix,
      prefixWidth: choice.width,
      heading,
      status,
      detail,
      capture: {
        inputs,
        completions,
        topHidden: capture.topHidden,
        bottomHidden: capture.bottomHidden,
        height: lines.length,
      },
      ascii: this.source.ascii(),
    });
    if (!frame) {
      return super.render(width);
    }

    this.lastFrame = frame;
    return [...frame.rows];
  }

  override handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const frame = this.lastFrame;
    if (!frame) return super.handleMouse(event);

    // Pi 全屏容器可能转发裁剪前的高度；触底时按实际可见行重建光标偏移。
    const height = this.tui.mode === "fullscreen"
      ? Math.min(event.height, this.tui.terminal.rows - event.screenY + event.y)
      : event.height;
    const cursorRow = height > 0 && height < frame.rows.length
      ? frame.rows.findIndex((row) => row.includes(CURSOR_MARKER))
      : -1;
    const offset = height > 0 ? Math.max(0, cursorRow - height + 1) : 0;
    const mapping = frame.mapping[event.y + offset];
    if (!mapping) return undefined;

    if (mapping.kind !== "input" && mapping.kind !== "completion") {
      return event.type === "click" ? { handled: true, focus: true } : undefined;
    }
    if (mapping.kind === "input" && event.x < frame.prefixWidth) {
      return event.type === "click" ? { handled: true, focus: true } : undefined;
    }
    return super.handleMouse({
      ...event,
      x: Math.max(0, event.x - (mapping.xOffset ?? 0)),
      y: mapping.nativeY ?? 0,
      width: frame.nativeWidth,
      height: frame.nativeHeight,
    });
  }
}
