# 迁移与回滚（旧 Powerline → pi-prompt）

## 1. 迁移矩阵

| 能力 | 旧 Powerline 实际使用 | pi-prompt 替代 | 状态 |
|---|---|---|---|
| status/preset/custom segments | 待用户确认 | 配置 `segments` + `/prompt-ui preset` | 已实现，需按实际配置映射 |
| model/thinking | 常用 | `model` 段 + 原生 footer | 已实现 |
| path/branch/session | 常用 | `path`/`git`/`session` | 已实现（默认 native 只在原生 footer） |
| token/cache/cost | 待确认 | `token_*`/`cache_*`/`cost` | 已实现，replace 显式启用 |
| context | 常用 | 中央 gauge | 已实现 |
| 时钟 | 可选 | `time` / `clock.enabled` | 已实现 |
| `/cd` | unknown | Pi 原生能力 | 未迁移 |
| queue | unknown | 无 | **无替代** |
| stash | unknown | 无 | **无替代** |
| sticky bash | unknown | 无 | **无替代** |
| delayed send | unknown | 无 | **无替代** |
| welcome | unknown | 无 | **无替代** |
| 快捷键 | unknown | 仅阅读 Pi 配置 | 未迁移 |

`unknown` 不视为“未使用”。若 queue/stash/sticky bash 等仍在用且无替代，应暂缓切换。

## 2. 共存规则

| 状态 | 规则 |
|---|---|
| 旧 Powerline 仅安装未加载 | 允许；建议先备份配置 |
| 已加载且 enabled=false，但运行期仍可通过命令/快捷键启用 | 拒绝与 pi-prompt 同时启用 |
| 已启用或 owner 未知 | 拒绝；先停止加载旧扩展并重启 |
| 两个扩展同时活动 | 不支持；load order 不能作为隔离手段 |

pi-prompt 检测到 editor 已被外国 factory 接管时拒绝覆盖并提示。footer 没有公开 getter，无法可靠检测所有 owner；因此默认 native footer，避免竞争。

## 3. 隔离验证步骤

1. 备份 `~/.pi/agent/settings.json` 与旧 Powerline 配置（不记录凭据）。
2. 新建独立 `PI_CODING_AGENT_DIR`，只加载锁定版本的 `@jackice/pi-ui` + `@jackice/pi-prompt`。
3. 在无害项目启动，确认 band、输入、多行、reload、preset、原生 footer。
4. 通过后才把组合写入日常配置。
5. 旧 queue/stash 文件只备份，不迁改、不删除。

## 4. 回滚

- `/prompt-ui preset native`：仅回退 editor；不重启也可以。
- 已设置 `footerMode=replace`：必须重启 Pi 才能恢复原生 footer。
- 禁用 pi-prompt（从 settings/packages 移除或 `enabled=false`）后重启。
- 如需恢复旧 Powerline，先确认 pi-prompt 不再加载，再恢复旧扩展；不要在同一进程内抢 editor/footer。
- 不修改 Hashline、TODO、审批业务数据。
