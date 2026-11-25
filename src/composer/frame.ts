import { displayWidth, truncate } from "@jackice/pi-ui";

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

export function alignHeading(left: string, right: string, width: number): string {
  const primary = truncate(left, width);
  const used = displayWidth(primary);
  const remaining = width - used;
  const gap = used > 0 ? 1 : 0;
  if (!right || remaining <= gap) return primary;
  const title = truncate(right, remaining - gap);
  return (gap ? primary : "") + " ".repeat(remaining - displayWidth(title)) + title;
}

export interface NativeCapture {
  inputs: readonly string[];
  completions: readonly string[];
  topHidden: number;
  bottomHidden: number;
  height: number;
}

export interface RowMapping {
  kind: "heading" | "status" | "detail" | "input" | "completion" | "scroll";
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
  prefix: string;
  prefixWidth: number;
  heading: string;
  status: string;
  detail?: string | undefined;
  capture: NativeCapture;
  ascii: boolean;
}

export function composeFrame(options: ComposeFrameOptions): FrameResult | undefined {
  const { width, prefix, prefixWidth, capture } = options;
  if (capture.inputs.length === 0) return undefined;
  const heading = truncate(options.heading, width);
  const status = truncate(options.status, width);
  const detail = options.detail?.trim() ? truncate(options.detail, width) : undefined;
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

  const push = (line: string, kind: RowMapping["kind"]): void => {
    rows.push(line);
    mapping.push({ kind });
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

  push(heading, "heading");
  push(status, "status");
  if (detail !== undefined) push(detail, "detail");
  pushScroll();
  pushInputs();
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
