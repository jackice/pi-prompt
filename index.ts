import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createExtension } from "./src/integration/pi.ts";

export default function piPromptExtension(pi: ExtensionAPI): void {
  createExtension(pi);
}
