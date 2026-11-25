# 兼容性与动态探针

## 1. 环境

| 项 | 值 |
|---|---|
| Pi | 1.6.0（`faac585884ae2c013a6b1400f3e9e77f10b34bac` tag 对应版本） |
| Node | v25.9.0 |
| OS | macOS 25.6.0 arm64 |
| 终端 | tmux 3.x + Ghostty（PTY 冒烟） |
| `@jackice/pi-ui` | 0.5.0（本地构建产物） |
| 隔离配置 | `PI_CODING_AGENT_DIR=/tmp/pi-prompt-agent` |

真实 Pi PTY 使用本地包 `/Users/jackice/dev/src/github.com/jackice/pi-prompt`，未连接付费模型、未发送 LLM 请求。启动时无可用模型，只验证 UI 与生命周期。

## 2. 使用的公开契约

| 契约 | 来源 | 用途 |
|---|---|---|
| `CustomEditor` | `@earendil-works/pi-coding-agent` | 保留 app keybindings 与原生编辑行为 |
| `Editor.renderTopBorder/renderBottomBorder` | `protected` 公共类型 | 在一次同步 render 内捕获原生边界 |
| `Editor.render(handleMouse/getPaddingX/setPaddingX)` | `@earendil-works/pi-tui` | 宽度布局与鼠标坐标映射 |
| `EditorComponent` / `EditorFactory` | extension types | `setEditorComponent` 安装/恢复 |
| `ctx.ui.getEditorComponent()` | extension UI | 所有权检查与 reload 重装 |
| `ctx.getContextUsage()` | ExtensionContext | Context Gauge |
| `ctx.sessionManager.getEntries()` | ReadonlySessionManager | 全文件 usage ledger |
| `ctx.model` / `pi.getThinkingLevel()` | 公共 API | Model 段 |
| `ctx.ui.setFooter(footerData)` | extension UI | 仅 `footerMode=replace` |
| `FooterDataProvider.getGitBranch/onBranchChange/getExtensionStatuses` | ReadonlyFooterDataProvider | replace bridge / Git fallback |
| `pi.exec("git", ...)` | ExtensionAPI | 异步 Git provider |

未使用：私有字段、Reflect、deep import、monkey patch、`setFooter(undefined)` 盲清、原生 editor 源码复制。

## 3. 静态契约（已核对）

1. 原生 `Editor.render` 顺序：top border → visible input rows → bottom border → autocomplete rows。
2. `handleMouse` 以 `renderedVisibleLineCount + 2` 作为 autocomplete 起始行，x 会再减去原生 padding。
3. `paddingX` 在宿主的 `setEditorComponent` 中从默认 editor 复制；运行中设置变更会调用 `setPaddingX`。
4. `CustomEditor` 默认 `embedWorkingStatus=false` 时，宿主把 working/compaction/retry 指示器放进独立 `statusContainer`，不占 band 行数。
5. 宿主 `resetExtensionUI()` 在 reload/switch 时先 `setExtensionFooter(undefined)`、`setCustomEditorComponent(undefined)`，再触发新 `session_start`。
6. `setCustomEditorComponent` 自动复制草稿、padding、autocomplete provider 与 app action handlers。

## 4. 动态 PTY 证据

| 场景 | 观察 |
|---|---|
| 启动 | 状态行 `φ > unknown ? ──…`、`╰─`、原生 footer 两行；无上下横线 |
| 输入 | 文本进入原生 editor，band 不改变提交内容 |
| 多行 | 首行 `╰─`，续行 3 列 gutter，末尾滚动行 `↑4 ↓0` |
| 30 列 | 状态行仍单行，不挤压输入 |
| 150 列 | gauge 弹性铺满，段不换行 |
| `/prompt-ui status` | owner=editor、footer=native、config default、已知缺失字段 |
| `/prompt-ui preset native` | 恢复原生上下边框；再切 band 恢复状态带 |
| `/prompt-ui preset borderless` | `❯` 输入行 + 下方状态行 |
| `/reload` | `session_start` 重新安装 editor，无重复/泄漏 |
| ASCII 配置 | `pi > unknown ? ---`、prefix `> ` |
| 非法 ASCII 配置 | 一次性 warning，回退安全默认 `φ`/`╰─ ` |
| footer A/B | 未安装扩展与 native 模式下 footer 两行逐字一致（空模型/空 session 状态） |
| replace 模式 | 输出两行实验 footer；启动时明确 warning，未通过 parity |
| hidden 模式 | 仅 band + 输入行，零 footer；启动 warning |
| compact 模式 | 单行 `cwd • context • model`，无原生 footer |
| inline 模式 | 3 行：status / input / `cwd > session`；无空白、无 footer |
| inline 多行/补全 | 滚动行后接 meta；补全在 meta 之后；40 列时 meta 降级不溢出 |
| custom → native | `/reload` 后恢复内置两行 footer（Pi 1.6.0） |

## 5. 未验证 / 风险

- 真实中文 IME 候选框、组合字符、鼠标拖选/补全点击；单元测试覆盖坐标映射，但未做手工 Ghostty 验证。
- 真实模型/上下文/usage 事件：本机无认证模型，G0-Data 只完成代码路径与 fixture 单测。
- TODO/Goal/Subagent/审批 modal 的并行高度与草稿恢复未做真实集成。
- 外部 Git 修改不会主动事件；仅下次刷新/命令可见。
- `footerMode=replace` 的逐字段 parity 未通过，默认关闭。

## 6. 失败策略

- 边界捕获失败、滚动提示超宽、任一行超宽、状态渲染异常：同帧回退 `super.render(fullWidth)`，不裁剪原生行。
- 状态行超宽：仅截断状态文本，不触碰输入与补全。
- 其他扩展占用 editor：拒绝接管并提示，不覆盖。
- 配置硬错误：忽略本次配置；有上一份有效配置则保留，否则使用安全默认并提示。
- Git 失败/非 repo：隐藏 Git 段，不弹窗、不阻塞编辑。
