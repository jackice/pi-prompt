# 原生 Footer 等价记录

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
- 允许的使用方式仅限开发/验收；完整 native preset 需重启才能恢复原生 footer。

## 4. 生命周期说明

- native：不安装 footer bridge，无 provider 引用、无订阅、无 epoch。
- replace：`setFooter` factory 只捕获只读 `footerData`；`onBranchChange` 订阅由 footer dispose 释放。
- 宿主 reload/switch 会先恢复内置 footer；pi-prompt 不会在运行时 `setFooter(undefined)` 盲清其他扩展的 footer。
