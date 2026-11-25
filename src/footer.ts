import type { Component } from "@earendil-works/pi-tui";
import type { ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";

import { fromPiTheme, middleTruncate, truncate } from "@jackice/pi-ui";

import type { PromptConfig } from "./config.ts";
import type { PromptFacts } from "./status/facts.ts";
import { formatCapacity, formatTokens } from "./status/usage.ts";

export interface PromptFooterSource {
  facts(): PromptFacts;
  config(): PromptConfig;
}

export class PromptFooter implements Component {
  private readonly theme: Theme;
  private readonly source: PromptFooterSource;
  private readonly footerData: ReadonlyFooterDataProvider;

  constructor(theme: Theme, source: PromptFooterSource, footerData: ReadonlyFooterDataProvider) {
    this.theme = theme;
    this.source = source;
    this.footerData = footerData;
  }

  invalidate(): void {}

  render(width: number): string[] {
    if (width <= 0) return [];
    const facts = this.source.facts();
    const config = this.source.config();
    const ui = fromPiTheme(this.theme);
    const home = process.env.HOME ?? process.env.USERPROFILE;
    const path = home && facts.session.cwd.startsWith(home) ? `~${facts.session.cwd.slice(home.length)}` : facts.session.cwd;
    const branch = facts.git?.branch ?? this.footerData.getGitBranch() ?? undefined;
    const sessionName = facts.session.name;
    const first = [
      path,
      branch ? `(${branch})` : undefined,
      sessionName ? `• ${sessionName}` : undefined,
    ].filter((part): part is string => Boolean(part)).join(" ");

    const parts: string[] = [];
    const usage = facts.usage;
    if (usage) {
      if ((usage.input ?? 0) > 0) parts.push(`↑${formatTokens(usage.input as number)}`);
      if ((usage.output ?? 0) > 0) parts.push(`↓${formatTokens(usage.output as number)}`);
      if ((usage.cacheRead ?? 0) > 0) parts.push(`R${formatTokens(usage.cacheRead as number)}`);
      if ((usage.cacheWrite ?? 0) > 0) parts.push(`W${formatTokens(usage.cacheWrite as number)}`);
      if (config.cost.enabled && usage.costTotal !== undefined && usage.costTotal > 0) {
        parts.push(`${usage.costFromProvider ? "$" : "≈$"}${usage.costTotal.toFixed(3)}`);
      }
    }
    if (facts.context) {
      const percent = facts.context.percent;
      const label = percent === undefined ? "?" : `${Math.round(percent)}%`;
      const capacity = formatCapacity(facts.context.capacity);
      parts.push(capacity ? `${label}/${capacity}` : label);
    }
    if (facts.model) {
      const thinking = facts.model.thinking && facts.model.thinking !== "off" ? ` ${facts.model.thinking}` : "";
      parts.push(`${middleTruncate(facts.model.name ?? facts.model.id, 20)}${thinking}`);
    }
    const second = parts.join(" ");
    return [ui.fg("muted", truncate(first, width)), ui.fg("muted", truncate(second, width))];
  }
}
