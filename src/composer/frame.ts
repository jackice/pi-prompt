import { displayWidth, truncate } from "@jackice/pi-ui";

import type { PromptShape } from "./shapes.ts";

export interface PrefixChoice {
  prefix: string;
  width: number;
  nativeWidth: number;
}

/**
 * P3-01a：先确定 prefix，再让原生 editor 在剩余宽度布局。
 * 只有 N>=2 且原生文本布局宽 L>=2 时才接受候选。
 */
export function choosePrefix(
  width: number,
  paddingX: number,
  candidates: readonly string[],
): PrefixChoice | undefined {
  if (!Number.isInteger(width) || width < 2) return undefined;
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const prefixWidth = displayWidth(candidate);
    if (prefixWidth >= width) continue;
    const nativeWidth = width - prefixWidth;
    const effectivePadding = Math.min(paddingX, Math.max(0, Math.floor((nativeWidth - 1) / 2)));
    const contentWidth = Math.max(1, nativeWidth - effectivePadding * 2);
    const layoutWidth = Math.max(1, contentWidth - (effectivePadding === 0 ? 1 : 0));
    if (nativeWidth >= 2 && layoutWidth >= 2) {
      return { prefix: candidate, width: prefixWidth, nativeWidth };
    }
  }
  return undefined;
}

export function alignMetaRow(left: string, right: string, width: number): string {
  if (width <= 0) return "";
  if (left.length > 0 && right.length > 0) {
    const gap = Math.max(1, width - displayWidth(left) - displayWidth(right));
    return truncate(`${left}${" ".repeat(gap)}${right}`, width);
  }
  if (left.length === 0 && right.length > 0) {
    const padding = " ".repeat(Math.max(0, width - displayWidth(right)));
    return truncate(`${padding}${right}`, width);
  }
  return truncate(left, width);
}

export interface NativeCapture {
  inputs: readonly string[];
  completions: readonly string[];
  topHidden: number;
  bottomHidden: number;
  height: number;
}

export interface RowMapping {
  kind: "status" | "input" | "completion" | "scroll" | "meta";
  nativeY?: number;
  xOffset?: number;
}

export interface FrameResult {
  rows: readonly string[];
  mapping: readonly RowMapping[];
  nativeWidth: number;
  nativeHeight: number;
  prefixWidth: number;
  identity: boolean;
}

export interface ComposeFrameOptions {
  width: number;
  shape: PromptShape;
  prefix: string;
  prefixWidth: number;
  status: string;
  /** editor 保留行里的单行元信息；只有 footerMode=inline 时提供。 */
  meta?: string | undefined;
  capture: NativeCapture;
  ascii: boolean;
}

export function composeFrame(options: ComposeFrameOptions): FrameResult | undefined {
  const { width, shape, prefix, prefixWidth, capture } = options;
  if (capture.inputs.length === 0) return undefined;
  const status = truncate(options.status.replace(/[\r\n]+/g, " "), width);
  const meta = options.meta === undefined
    ? undefined
    : truncate(options.meta.replace(/[\r\n]+/g, " "), width);
  const hiddenTop = Math.max(0, Math.floor(capture.topHidden));
  const hiddenBottom = Math.max(0, Math.floor(capture.bottomHidden));
  const scroll = hiddenTop + hiddenBottom > 0
    ? options.ascii
      ? `up:${hiddenTop} down:${hiddenBottom}`
      : `↑${hiddenTop} ↓${hiddenBottom}`
    : undefined;
  if (scroll !== undefined && displayWidth(scroll) > width) return undefined;

  const rows: string[] = [];
  const mapping: RowMapping[] = [];
  const gutter = " ".repeat(prefixWidth);

  const pushStatus = (): void => {
    rows.push(status);
    mapping.push({ kind: "status" });
  };
  const pushInputs = (): void => {
    capture.inputs.forEach((line, index) => {
      rows.push(`${index === 0 ? prefix : gutter}${line}`);
      mapping.push({ kind: "input", nativeY: index + 1, xOffset: prefixWidth });
    });
  };
  const pushScroll = (): void => {
    if (scroll === undefined) return;
    rows.push(gutter + scroll);
    mapping.push({ kind: "scroll" });
  };
  const pushMeta = (): void => {
    if (meta === undefined) return;
    rows.push(meta);
    mapping.push({ kind: "meta" });
  };
  const pushCompletions = (): void => {
    capture.completions.forEach((line, index) => {
      rows.push(gutter + line);
      mapping.push({
        kind: "completion",
        nativeY: capture.inputs.length + 2 + index,
        xOffset: prefixWidth,
      });
    });
  };

  if (shape.statusPlacement === "above") pushStatus();
  pushInputs();
  pushScroll();
  if (shape.statusPlacement === "below") pushStatus();
  pushMeta();
  pushCompletions();

  for (const row of rows) {
    if (displayWidth(row) > width) return undefined;
  }

  return {
    rows,
    mapping,
    nativeWidth: width - prefixWidth,
    nativeHeight: capture.height,
    prefixWidth,
    identity: false,
  };
}
