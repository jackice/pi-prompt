# @jackice/pi-prompt

OMP 风格的单行状态带 + 无边框输入区，保留 Pi 原生编辑器行为与原生 footer。

```text
φ > GPT-6.2 high 2% ━──────────────────────────────── 500K 41t/s
╰─ 你的输入
~/dev/pi-prompt (develop) • session
↑18k ↓4.6k R219k W1.2k CH92% 2%/500K (auto)    GPT-6.2 high
```

- 状态带只有一行；普通输入不再出现上下横线。
- 光标、补全、历史、撤销、粘贴、附件、IME 与鼠标坐标仍由原生 `Editor` 处理。
- 默认 `footerMode=native`：不调用 `setFooter`，原生 footer 的 2–3 行完整保留。
- 默认 `Native Compact` 只显示 brand、model/thinking、context gauge，以及可信 live 速率。

## 兼容性

| 组件 | 已验证版本 |
|---|---|
| Pi | 1.6.0 |
| Node | v25.9.0 |
| `@jackice/pi-ui` | 0.5.0 |
| 平台 | macOS arm64（Ghostty/tmux PTY 冒烟） |

只使用 Pi 公开 API：`CustomEditor`、`protected renderTopBorder/renderBottomBorder`、`setEditorComponent`、`getContextUsage`、`sessionManager.getEntries`、footer data provider。没有私有字段、Reflect、deep import 或 monkey patch。

## 安装

发布前使用本地路径或 tarball：

```bash
pi install /absolute/path/to/pi-prompt
# 或
pi install npm:@jackice/pi-prompt
```

依赖 `@jackice/pi-ui@^0.5.0` 作为普通 dependency，避免 Pi 安装器不安装 peer dependency 导致加载失败。发布顺序必须先 pi-ui 0.5.0，再 pi-prompt。

## 配置

默认读取 `${PI_CODING_AGENT_DIR:-~/.pi/agent}/pi-prompt.json`。缺失或非法配置时使用安全默认值，并一次性提示错误。

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

- `shape`: `band` | `native` | `borderless`。`native` 不安装自定义 editor/footer。
- `icons=ascii` 时 prefix/brand 必须是 ASCII，分隔符与 gauge 使用 ASCII glyph。
- `footerMode=replace` 仍是实验模式：需要独立 parity 验收，默认禁止用于生产。
- 未在 `segments` 中列出的数据不会启动采集；Git provider 只在配置了 `git` 段或 `git.enabled=true` 时启动。

### 分段

| ID | 说明 |
|---|---|
| `brand` | 配置的品牌文本 |
| `hostname` | 8 列内主机名，超长中间省略 |
| `model` | 模型名 + thinking level |
| `path` | cwd；`~` 缩写，带 compact/min |
| `git` | 分支 + dirty 标记；非 repo 隐藏 |
| `session` | 会话名称或短 ID |
| `workflow` / `subagents` | 通过 `extensionStatusKeys` 映射的扩展状态 |
| `extension_statuses` | 未映射扩展状态聚合 |
| `token_in` / `token_out` / `token_total` | 全 Session 文件累计 |
| `cache_read` / `cache_write` | 全 Session 文件累计 |
| `token_rate` | 仅 streaming 期间可信 live 速率 |
| `elapsed` | 当前响应耗时 |
| `cost` | `$` = provider 计费，`≈$` = 目录估算 |
| `time` | 时钟，需显式配置或 `clock.enabled` |

`context` 不是左右分段 ID，而是中央弹性 gauge。

## 命令

- `/prompt-ui status`：当前 owner、preset、配置路径、模型/context/usage/git、已知缺失字段。
- `/prompt-ui refresh`：手动刷新状态与 Git。
- `/prompt-ui preset band|native|borderless`：运行时仅切换 editor；`footerMode=replace` 下完整 native 需重启。

## 数据语义

- **usage**：`session_file` 口径，当前 Session 文件所有分支的五类持久化 entry（`usage`、assistant message、toolResult、`branch_summary`、`compaction`），与 Pi 1.6.0 原生 footer 一致。不是账户累计，也不是当前分支累计。
- **context**：只来自 `ctx.getContextUsage()`；未知显示 `?`，不猜测。
- **token_rate**：当前响应累计 output tokens ÷ 单调时长；不可信时隐藏。
- **git**：异步 `git --no-optional-locks status --porcelain=v2 -z --branch`，2s 超时，最多 1 个子进程 + 1 次合并 pending。外部修改不会实时推送，需下次事件或 `/prompt-ui refresh`。
- 默认零定时轮询、零新增 LLM 请求、零 token 消耗。

## 回退与共存

- `shape=native` 是完整原生回退（不安装 editor，不替换 footer）。
- 运行时 `/prompt-ui preset native` 只回退 editor；已替换 footer 时必须重启。
- 检测到其他扩展已接管 editor 时拒绝覆盖并提示。旧 Powerline 与 pi-prompt 的活动 editor/footer 必须互斥；仅安装但不加载允许。
- 不使用私有容器排序；TODO/Goal/Subagent/审批 widget 由 Pi 原生管理。

## 已知限制

- `footerMode=replace` 未完成原生 footer 逐字段 parity，未知字段包括 `(auto)`、CH%、routed model/effort、`xp`、`(sub)`；该模式默认关闭，不宣称等价。
- 真实中文 IME、宽字符、鼠标选择仍需 Ghostty/tmux 手工验收；PTY 冒烟覆盖普通输入、多行、滚动、preset、reload、窄/宽 resize。
- 外部 Git 修改不会主动触发刷新。
- 不实现队列、stash、sticky bash、delayed send、welcome 等旧 Powerline 附加功能。

## 开发

```bash
npx vitest run        # 单元测试
npx tsc --noEmit      # 类型检查
npx tsx examples/gallery.ts
npx tsx scripts/bench.ts
```

详细证据见 `docs/implementation-status.md`、`docs/compatibility.md`、`docs/footer-parity.md`、`docs/performance.md`、`docs/migration.md`。
