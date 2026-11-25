# 原生 Footer 等价记录

## 0.2.0 的底栏

- `native` 不接管底栏；全屏单行输入时，原生底栏直接跟随输入。真实 Pi 1.6.0 PTY 中观察到原生路径/分支/标题、用量和 `(auto)`。
- `none` 安装零行底栏，输入位于最末。可通过 `segments`、`metaSegments`、`detailSegments` 配置输入上方的字段，不承诺与 Pi 原生底栏逐字段等价。
- 从 `none` 切回 `native` 时，先改配置，再 `/reload` 或重启。旧版自定义底栏模式已移除，参见[迁移说明](migration.md)。

以下 §1–5 是 0.1.x 的对照记录。

## 1. 默认：`footerMode=native`

pi-prompt 不调用 `setFooter`，`provider` 引用始终为 null。原生 footer 由 Pi 自己渲染。

### 已取得的 A/B 证据

同一 cwd、同一空模型/空 session 状态、100×30 tmux：

| 组 | Footer 行 |
|---|---|
| 未安装 pi-prompt | `~/dev/src/github.com/jackice` / `0.0%/0 (auto) … unknown` |
| pi-prompt `footerMode=native` | `~/dev/src/github.com/jackice` / `0.0%/0 (auto) … unknown` |

逐字一致；状态带只额外增加 1 行，原生 editor 上下边框被替换。

**结论范围**：仅证明该状态下的原生 footer 未被替换、行数与文本一致。真实 usage/CH%/cost/model 数据下的全字段对照尚未完成。

## 2. 字段矩阵（§8.1）

| 原生字段 | band 对应 | native 模式 | replace 等价状态 |
|---|---|---|---|
| cwd | path | 仅原生 footer（默认不配置 path） | 文字可得；完整路径可查看（未做宽度展开 UI） |
| branch | git | 仅原生 footer | async Git 可得；detached/unborn 单测覆盖 |
| session name | session | 仅原生 footer | name 与 ID 不等价，已分别显示 |
| input/output | token_in/out | 原生 footer 保留 | 同五类 entry 口径，单测覆盖 |
| cache R/W | cache_read/write | 原生 footer 保留 | 同上 |
| CH% | 无独立 ID | 原生 footer 保留 | **未实现**，列已知缺失 |
| cost / (sub) | cost | 原生 footer 保留 | `cost.total` 累计；`totalFromProvider` 区分计费/估算；`(sub)` 无来源 |
| (auto) | 无 | 原生 footer 保留 | **缺失** |
| xp | 无 | 原生 footer 保留 | **缺失** |
| context % / capacity | gauge | band gauge + 原生 footer | `ctx.getContextUsage()` |
| model / thinking / provider | model | band 摘要 + 原生 footer | 公开 API |
| routed model / effort | 无 | 原生 footer 保留 | **缺失**（公开 API 不暴露 routedModel） |
| extension statuses | extension_statuses / workflow / subagents | 原生 footer | replace 每帧读取公开 getter |

## 3. `footerMode=replace` 结论

- 实现存在，可显式启用，但**未通过 parity**。
- 缺失：CH%、`(auto)`、routed model/effort、`xp`、`(sub)`；这些字段没有任何可伪造的公开来源。
- 因此首版默认不启用，也不宣称替代原生 footer。启动时会发出一次性实验 warning。
- 允许的使用方式仅限开发/验收；切回 native preset 可 `/reload`（Pi 1.6.0 已验证）或重启。

## 4. 生命周期说明

- native：不安装 footer bridge，无 provider 引用、无订阅、无 epoch。
- compact/replace：`setFooter` factory 捕获只读 `footerData`；`onBranchChange` 订阅由 footer dispose 释放。
- hidden：安装零行 `EmptyFooter`，不订阅分支变化。
- 宿主 reload/switch 会先恢复内置 footer；pi-prompt 不会在运行时 `setFooter(undefined)` 盲清其他扩展的 footer。

## 5. 自定义 footer 模式（0.1.2）

| 模式 | 行数 | 内容 | 恢复原生 |
|---|---:|---|---|
| `native` | 2–3 | Pi 内置 FooterComponent，字段最完整 | 无需操作 |
| `compact` | 1 | path(branch) • 扩展/context/model/cost（0 隐藏） | `/reload` 或重启 |
| `replace` | 2 | 第一行 path/branch/session；第二行 tokens/cache/cost/context/model | `/reload` 或重启 |
| `hidden` | 0 | 零行 EmptyFooter；editor 保留行留白 | `/reload` 或重启 |
| `inline` | 0 | 零行 EmptyFooter；editor 保留行显示 `metaSegments`（path/git/session/cost） | `/reload` 或重启 |

- `compact`/`hidden` 沿用 native 的分段默认，不自动启用 Git/cost。
- `inline` 沿用 native 分段默认，`metaSegments` 默认 `path/git/session/cost`；cost 需 `cost.enabled=true` 且有非零值才显示。
- `inline` 的 meta 行位于输入/滚动之后、补全之前；右侧分组按宽度右对齐，窄宽逐级隐藏。
- 三种自定义模式会替换原生 footer；不宣称字段等价。`replace` 仍是实验模式。
- Pi 1.6.0 PTY 已验证：hidden 无 footer；compact 单行；inline 空闲 3 行、无空白；切回 native 后 `/reload` 恢复内置 footer 两行。
- 其他 Pi 版本或自定义 footer owner 场景仍以重启为安全回滚路径。

