# Changelog

## 0.1.3

- In `footerMode=inline`, the meta row falls back to Pi's footer branch and starts the async Git provider when `metaSegments` contains `git`.
- Branch changes from the footer provider invalidate the meta cache.
- 83 tests pass; no config changes.

## 0.1.2

- Add `footerMode=inline`: zero footer plus one `metaSegments` line inside Pi's reserved editor row. The composer stays 3 rows with no blank line.
- Add `metaSegments` config with right-aligned SegmentBar rendering, priority truncation, and cost/git/session hiding rules.
- Keep `hidden` and `compact` unchanged; `inline` is the recommended no-blank mode.
- `/reload` restores the native footer in Pi 1.6.0; restart remains the safe fallback.
- Add inline config/segment/frame/editor tests; 83 tests pass.

## 0.1.1

- Add `footerMode=compact`: one custom footer line with path/branch, context, and model.
- Add `footerMode=hidden`: zero-line footer via the official empty footer component.
- Keep `footerMode=native` as the default; `/reload` restores the built-in footer in Pi 1.6.0, with restart as the safe fallback.
- Add footer rendering and config tests; 68 tests pass.

## 0.1.0

- 新增 OMP 风格单行状态带：替换原生 editor 顶边、移除底边，保留原生输入/补全/光标。
- 新增 `╰─ ` 前缀、多行续行 gutter、合并 `↑N ↓M` 滚动提示。
- 新增 `band` / `borderless` / `native` 三种 preset；默认 native footer 完整保留。
- 新增配置 schema、安全默认值、一次性诊断与 ASCII 校验。
- 新增 Session 文件 usage ledger（五类 entry，与原生 footer 同口径）、Context、live token rate、异步 Git provider。
- 新增分段：brand/model/path/git/session/context/token/cache/rate/cost/time/workflow/subagents/extension_statuses。
- 新增 `/prompt-ui status|refresh|preset`。
- 使用 `@jackice/pi-ui@^0.5.0` 的 `SegmentBar`、`InlineGauge`、`renderSeparator`。
- 真实 Pi 1.6.0 PTY 冒烟：band/borderless/native、ASCII、非法配置回退、多行滚动、preset 热切换、reload、窄/宽 resize、原生 footer A/B。
- `footerMode=replace` 仅实验：默认关闭，未完成逐字段 parity。
