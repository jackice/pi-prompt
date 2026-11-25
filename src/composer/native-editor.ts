import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TuiMouseEvent, TuiMouseEventResult, TUI } from "@earendil-works/pi-tui";

import { choosePrefix, composeFrame, type FrameResult } from "./frame.ts";
import type { PromptShape } from "./shapes.ts";

export interface BandEditorSource {
  renderStatus(width: number): string;
  shape(): PromptShape;
  prefix(): string;
  ascii(): boolean;
}

interface CaptureState {
  topToken: string;
  bottomToken: string;
  topHidden: number;
  bottomHidden: number;
}

let tokenCounter = 0;

function nextToken(kind: string): string {
  tokenCounter++;
  return `\u0000pi-prompt:${kind}:${tokenCounter}:${Math.random().toString(36).slice(2, 10)}\u0000`;
}

export class BandEditor extends CustomEditor {
  private capture: CaptureState | undefined;
  private lastFrame: FrameResult | undefined;
  private readonly source: BandEditorSource;

  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, source: BandEditorSource) {
    super(tui, theme, keybindings, { embedWorkingStatus: false });
    this.source = source;
  }

  getFrame(): FrameResult | undefined {
    return this.lastFrame;
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
    const shape = this.source.shape();
    if (shape.statusPlacement === "none") {
      return super.render(width);
    }
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

    let status: string;
    try {
      status = this.source.renderStatus(width);
    } catch {
      return super.render(width);
    }
    if (status.includes("\n") || status.includes("\r")) return super.render(width);

    const frame = composeFrame({
      width,
      shape,
      prefix: choice.prefix,
      prefixWidth: choice.width,
      status,
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
    const mapping = frame?.mapping[event.y];
    if (!frame || !mapping) return undefined;

    if (mapping.kind === "status" || mapping.kind === "scroll") {
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
