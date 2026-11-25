# @jackice/pi-prompt

An OMP-style composer for Pi: activity and session status above the native input, with no reserved blank line below it.

```text
Working…                                                     Session title
φ > GPT-6.2 high > ~/dev/pi-prompt > develop > 01a20bd5  2% ───── 500K
╰─ your input
```

- The example uses `footerMode: "none"`. The session title (or working directory for unnamed sessions) stays right-aligned when idle and during activity. Native activity appears on the left and takes priority in narrow terminals.
- `footerMode: "native"` is the default. Pi's own footer follows the input with no fixed blank row between them.
- The editor still handles the cursor, autocomplete, history, undo, paste, attachments, IME, and mouse input.

## Compatibility

| Component | Verified version |
|---|---|
| Pi | 1.6.0 |
| Node | v25.9.0 |
| `@jackice/pi-ui` | 0.5.0 |
| Platform | macOS arm64 (Ghostty/tmux PTY smoke test) |

The extension uses Pi's public editor hooks, native activity indicator, `setEditorComponent`, `getContextUsage`, and session APIs. Only `footerMode: "none"` calls `setFooter`, to install a zero-row component. No private fields, `Reflect`, deep imports, or monkey patching.

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
  "metaSegments": [],
  "detailSegments": [],
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

- `shape`: `band` and `borderless` use the same stacked layout with different input prefixes. `native` leaves the Pi editor unchanged; `footerMode` is independent.
- `footerMode`: `native` keeps Pi's built-in footer and all its fields; `none` removes it. Set `none` to keep the input as the last row when no completion menu or other extension widget is open. After changing this setting, use `/reload` in Pi 1.6.0 or restart Pi.
- `segments.left` and `segments.right` select the main status band's fields. With `footerMode: "none"`, `metaSegments` merges fields into that band, and `detailSegments` puts fields on a separate line above the input. The detail line is omitted when none of its fields can be displayed. A field appears once: explicitly placed main-band fields take priority, then detail fields, then metadata.
- With `icons=ascii`, the prefix and brand must be ASCII; separators and the gauge use ASCII glyphs.
- The Git provider starts only when a `git` segment is in use or `git.enabled` is `true`.

### Upgrading from 0.1.x

Before updating, replace removed `footerMode` values with `"none"`:

| Old value | Settings to preserve the information you want |
|---|---|
| `hidden` | Set `metaSegments` to `[]` if the old config specified it. The old `hidden` mode ignored this list. |
| `inline` | Keep `metaSegments`. If it was implicit, set `["path", "git", "session", "cost"]`. |
| `compact` | Set `metaSegments` to `["path", "git", "session", "token_in", "token_out", "cache_read", "cache_write", "cost"]`. Model and context are already in the default band. |
| `replace` | Use the recipe below for the old defaults. Keep your existing explicit segment and status-key overrides where needed. |

For `replace` with no custom field overrides:

```json
{
  "footerMode": "none",
  "metaSegments": ["path", "git", "session", "workflow", "subagents", "extension_statuses"],
  "detailSegments": ["token_in", "token_out", "cache_read", "cache_write", "cost"],
  "extensionStatusKeys": { "workflow": "jackice:workflow", "subagents": "jackice:subagents" },
  "cost": { "enabled": true }
}
```

If you already placed a field in `segments`, remove it there to move it to the detail row. Keep any explicit `cost.enabled` override.

`native` does not change. The extension warns on old values rather than silently reinterpreting them. See [migration and rollback](docs/migration.md).

### Segments

| ID | Description |
|---|---|
| `brand` | Configured brand text |
| `hostname` | Hostname clipped to 8 columns, middle-truncated |
| `model` | Model name plus thinking level |
| `path` | cwd with `~` shortening and compact/min variants |
| `git` | Branch plus dirty marker; hidden outside a repo |
| `session` | Short session ID; the title is in the top row |
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

- `/prompt-ui status`: current owner, editor preset, footer mode, config path, and data sources.
- `/prompt-ui refresh`: refresh state and Git on demand.
- `/prompt-ui preset band|native|borderless`: switch the editor at runtime without changing `footerMode`.

## Data semantics

- **usage**: `session_file` scope. All persisted entries of the current session file across all branches, using the same five entry classes as the Pi 1.6.0 native footer (`usage`, assistant message, toolResult, `branch_summary`, and `compaction`). It is not an account total and not a current-branch total.
- **context**: only from `ctx.getContextUsage()`. Unknown is rendered as `?`; nothing is guessed.
- **token_rate**: accumulated output tokens for the current response divided by monotonic time. Hidden when not trustworthy.
- **git**: asynchronous `git --no-optional-locks status --porcelain=v2 -z --branch`, 2 s timeout, at most one child process plus one merged pending refresh. External changes are visible on the next event or `/prompt-ui refresh`.
- No periodic polling by default, no extra LLM requests, and no extra token usage.

## Fallback and coexistence

- For a fully native layout, set `shape: "native"` and `footerMode: "native"`.
- `/prompt-ui preset native` only reverts the editor. To restore the footer, set `footerMode: "native"` and reload or restart.
- If another extension already owns the editor, pi-prompt refuses to take over and reports it. The old Powerline and pi-prompt must not both own the active editor/footer. Installing without loading is allowed.
- Pi's native widgets (TODO, Goal, Subagent, approval) remain managed by Pi.

## Known limitations

- With `footerMode: "none"`, the configured band is not a replica of the native footer. Use `native` for fields such as CH%, subscription status, and routed model/effort.
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
