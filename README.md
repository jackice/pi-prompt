# @jackice/pi-prompt

An OMP-style single-line status band and borderless prompt area for Pi, while preserving the native editor and native footer.

```text
φ > GPT-6.2 high 2% ━──────────────────────────────── 500K 41t/s
╰─ your input
~/dev/pi-prompt (develop) • session
↑18k ↓4.6k R219k W1.2k CH92% 2%/500K (auto)    GPT-6.2 high
```

- The band is exactly one line; normal input no longer has top/bottom borders.
- Cursor, autocomplete, history, undo, paste, attachments, IME, and mouse coordinates stay in the native `Editor`.
- `footerMode=native` by default: `setFooter` is never called and the native 2–3 line footer is kept intact.
- The default Native Compact layout shows only brand, model/thinking, the context gauge, and a trustworthy live token rate.

## Compatibility

| Component | Verified version |
|---|---|
| Pi | 1.6.0 |
| Node | v25.9.0 |
| `@jackice/pi-ui` | 0.5.0 |
| Platform | macOS arm64 (Ghostty/tmux PTY smoke test) |

Only public Pi APIs are used: `CustomEditor`, `protected renderTopBorder/renderBottomBorder`, `setEditorComponent`, `getContextUsage`, `sessionManager.getEntries`, and the footer data provider. No private fields, `Reflect`, deep imports, or monkey patching.

## Installation

```bash
pi install npm:@jackice/pi-prompt
```

`@jackice/pi-ui@^0.5.0` is a regular dependency so the Pi installer resolves it automatically. A peer dependency would not be installed by the Pi installer and would make the extension fail to load.

## Configuration

The default config path is `${PI_CODING_AGENT_DIR:-~/.pi/agent}/pi-prompt.json`. Missing or invalid config falls back to safe defaults and reports the errors once.

```json
{
  "enabled": true,
  "shape": "band",
  "separator": "ascii",
  "transparent": true,
  "icons": "unicode",
  "prefix": "╰─ ",
  "brand": { "text": "φ" },
  "footerMode": "native",
  "segments": {
    "left": ["brand", "model"],
    "right": ["token_rate"]
  },
  "context": { "enabled": true, "style": "embedded", "warning": 70, "critical": 90 },
  "git": {
    "enabled": false,
    "dirty": true,
    "ttlMs": 5000,
    "refresh": "event",
    "pollIntervalMs": 10000
  },
  "clock": { "enabled": false },
  "cost": { "enabled": false }
}
```

- `shape`: `band`, `native`, or `borderless`. `native` installs no custom editor or footer.
- `footerMode`: `native` keeps Pi's built-in 2–3 line footer; `compact` replaces it with one custom line; `replace` uses two custom lines and remains experimental; `hidden` removes the footer entirely. In Pi 1.6.0, `/reload` restores the native footer after a mode change; restarting Pi is the safe fallback.
- With `icons=ascii`, the prefix and brand must be ASCII; separators and gauge use ASCII glyphs.
- `footerMode=replace` is still experimental and requires a separate parity review. It is disabled by default for production use.
- Data sources that are not listed in `segments` are not collected. The Git provider only starts when a `git` segment is configured or `git.enabled=true`.

### Segments

| ID | Description |
|---|---|
| `brand` | Configured brand text |
| `hostname` | Hostname clipped to 8 columns, middle-truncated |
| `model` | Model name plus thinking level |
| `path` | cwd with `~` shortening and compact/min variants |
| `git` | Branch plus dirty marker; hidden outside a repo |
| `session` | Session name or short ID |
| `workflow` / `subagents` | Extension statuses mapped through `extensionStatusKeys` |
| `extension_statuses` | Aggregated unmapped extension statuses |
| `token_in` / `token_out` / `token_total` | Session-file totals |
| `cache_read` / `cache_write` | Session-file totals |
| `token_rate` | Live output rate while streaming and trustworthy |
| `elapsed` | Duration of the current response |
| `cost` | `$` for provider-billed cost, `≈$` for catalog estimate |
| `time` | Clock; requires explicit config or `clock.enabled` |

`context` is not a left/right segment ID. It is the elastic center gauge.

## Commands

- `/prompt-ui status`: current owner, preset, config path, model/context/usage/git, and known gaps.
- `/prompt-ui refresh`: refresh state and Git on demand.
- `/prompt-ui preset band|native|borderless`: switch the editor at runtime. With `footerMode=replace`, a full native preset requires a restart.

## Data semantics

- **usage**: `session_file` scope. All persisted entries of the current session file across all branches, using the same five entry classes as the Pi 1.6.0 native footer (`usage`, assistant message, toolResult, `branch_summary`, and `compaction`). It is not an account total and not a current-branch total.
- **context**: only from `ctx.getContextUsage()`. Unknown is rendered as `?`; nothing is guessed.
- **token_rate**: accumulated output tokens for the current response divided by monotonic time. Hidden when not trustworthy.
- **git**: asynchronous `git --no-optional-locks status --porcelain=v2 -z --branch`, 2 s timeout, at most one child process plus one merged pending refresh. External changes are visible on the next event or `/prompt-ui refresh`.
- No periodic polling by default, no extra LLM requests, and no extra token usage.

## Fallback and coexistence

- `shape=native` is the full native fallback (no editor, no footer replacement).
- `/prompt-ui preset native` only reverts the editor. If the footer was replaced, restart Pi.
- If another extension already owns the editor, pi-prompt refuses to take over and reports it. The old Powerline and pi-prompt must not both own the active editor/footer. Installing without loading is allowed.
- Pi's native widgets (TODO, Goal, Subagent, approval) remain managed by Pi.

## Known limitations

- `footerMode=replace` has not passed field-by-field parity with the native footer. Missing fields include `(auto)`, CH%, routed model/effort, `xp`, and `(sub)`. The mode is off by default and must not be described as equivalent.
- `footerMode=compact` intentionally drops token counts and the native `(auto)`/`(sub)`/CH%/routed-model fields to fit one line. `footerMode=hidden` removes the footer completely; add `path`/`git`/token segments to the band if you still need that data.
- Real CJK IME, wide characters, and mouse selection still need manual Ghostty/tmux verification. PTY smoke tests cover normal input, multi-line drafts, scrolling, presets, reload, and narrow/wide resizes.
- External Git changes do not trigger a refresh by themselves.
- Legacy Powerline extras such as queue, stash, sticky bash, delayed send, and welcome are not implemented.

## Development

```bash
npx vitest run
npx tsc -p tsconfig.json --noEmit
npx tsx examples/gallery.ts
npx tsx scripts/bench.ts
```

Evidence lives in `docs/implementation-status.md`, `docs/compatibility.md`, `docs/footer-parity.md`, `docs/performance.md`, and `docs/migration.md`.
