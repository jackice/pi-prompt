import { displayWidth } from "@jackice/pi-ui";

import type { PromptConfig, PromptShapeId } from "../config.ts";

export interface PromptShape {
  id: PromptShapeId;
  statusPlacement: "above" | "below" | "none";
  firstPrefix: string;
  continuationPrefix: string;
  transparent: boolean;
}

export function resolveShape(config: PromptConfig): PromptShape {
  if (config.shape === "native") {
    return {
      id: "native",
      statusPlacement: "none",
      firstPrefix: "",
      continuationPrefix: "",
      transparent: true,
    };
  }
  const ascii = config.icons === "ascii";
  if (config.shape === "borderless") {
    const prefix = ascii ? "> " : "❯ ";
    return {
      id: "borderless",
      statusPlacement: "below",
      firstPrefix: prefix,
      continuationPrefix: " ".repeat(displayWidth(prefix)),
      transparent: true,
    };
  }
  return {
    id: "band",
    statusPlacement: "above",
    firstPrefix: config.prefix,
    continuationPrefix: " ".repeat(displayWidth(config.prefix)),
    transparent: config.transparent,
  };
}
