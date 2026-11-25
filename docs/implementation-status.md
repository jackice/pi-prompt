# 实施状态

最后更新：2026-11-25

## 1. 环境

- Pi 1.6.0、Node v25.9.0、macOS arm64。
- `@jackice/pi-ui` 0.5.0（本地构建，根导出含 SegmentBar/Separator/InlineGauge）。
- 真实 Pi PTY 使用 `PI_CODING_AGENT_DIR=/tmp/pi-prompt-agent` 隔离配置；无可用模型，未发出 LLM 请求。
- 测试命令：`npx vitest run`、`npx tsc -p tsconfig.json --noEmit`、`npx tsx examples/gallery.ts`、`npx tsx scripts/bench.ts`。

## 2. 任务与门禁

| 任务 | 状态 | 证据 | 备注 |
|---|---|---|---|
| P0-01 环境与源码 | 完成 | `docs/compatibility.md` §1-3 | 包指纹、公开 API、静态行序 |
| G0-Base | 通过 | 真实 Pi 加载本地包，`[Extensions] pi-prompt`；band 渲染 | 未发布 |
| G0-Editor | 通过（主路径） | PTY：无上下横线、`╰─`、多行 gutter、`↑N ↓M`、30/150 列、reload、preset | 鼠标/IME 未手工验证 |
| G0-Data | 部分 | usage ledger 7 个测试、Git parser 6 个测试；Context/rate 代码路径 | 无真实模型事件；未做真实 usage fixture |
| G0-FooterBridge native | 通过（范围有限） | A/B footer 两行逐字一致（空模型/空 session） | 全字段未覆盖 |
| G0-FooterBridge replace | BLOCKED | 缺 CH%/(auto)/routed/xp/(sub)，无公开来源 | 默认禁止，启动 warning |
| G0-Coexist | 部分 | reload/preset/foreign editor 拒绝；TODO/审批真实并存未跑 | Powerline 活动互斥靠拒绝接管 |
| P1 pi-ui 组件 | 完成 | pi-ui `v0.5.0`，106 用例 | 见 pi-ui `implementation-status.md` |
| G1-Prompt | 通过（本地） | `@jackice/pi-ui` 根导出消费；`tsc` 通过 | npm 未发布 |
| P2-01/02 usage | 完成（代码） | `src/status/usage.ts`、五类 entry 测试、CH% 单测 | 无真实 Session 文件对照 |
| P2-03 Git | 完成（代码） | parser 6 测试；provider 并发/超时/代际代码审阅 | 无真实 repo UI 断言 |
| P2-04 scheduler | 完成 | 10Hz trailing / cancel 单测 | — |
| G2-Prompt | 部分 | 单元测试通过 | 真实 Session fixture、多 provider 未跑 |
| P3-01/02 frame | 完成 | prefix 决策表 5 测试、frame 7 测试、editor 9 测试 | — |
| G3-Prompt | 部分 | PTY 视觉、多行/滚动、宽度矩阵 | 鼠标点击/拖选、IME 未手工 |
| P4-01 segments | 完成 | 11 个 segment 测试、gallery | — |
| P4-02 config/commands | 完成 | 10 个 config 测试；PTY 命令/非法配置回退 | — |
| G4-Prompt | 部分 | 宽/窄、ASCII、未知数据、配置错误、preset | 主题切换、重复状态真实集成未跑 |
| P5-01 宿主所有权 | 完成（主路径） | reload 重装、native 热切、foreign factory 拒绝 | footer owner 无公开检测 |
| P5-02 共存矩阵 | 未执行 | — | 需真实 TODO/Goal/Subagent/审批 |
| G5-Prompt | 未通过 | 共存未验证 | — |
| P6-01 测试矩阵 | 部分 | 61 用例；PTY 冒烟；无手工 IME/鼠标 | — |
| P6-02 性能 | 部分 | `docs/performance.md`：热态 P95 0.012–0.023 ms；冷启动/RSS 未测 | — |
| P6-03 迁移 | 文档完成 | `docs/migration.md` | 实际 Powerline 配置审计未做 |
| G6-Prompt | 未通过 | 独立 Reviewer、性能完整矩阵、迁移实测缺 | 不发布 v1.0 |

## 3. 验证记录

| 命令/场景 | 结果 |
|---|---|
| `npx vitest run` | 7 文件 / 61 测试通过 |
| `npx tsc -p tsconfig.json --noEmit` | 通过 |
| `npx tsx examples/gallery.ts` | 40/80/120 列、native/replace/ASCII 均渲染 |
| `npx tsx scripts/bench.ts` | 默认状态带 P95 0.012 ms；BandEditor P95 0.015 ms |
| Pi PTY 启动 | `φ > unknown ? ─…`、`╰─`、原生 footer 两行 |
| 多行/滚动 | `↑4 ↓0`，续行 3 列 gutter |
| `/prompt-ui status` | owner=editor、footer=native、config default、known-gaps |
| `/prompt-ui preset native` → band | 边框恢复/移除，草稿保留 |
| `/prompt-ui preset borderless` | `❯` + 下方状态 |
| `/reload` | 重新安装 editor，无重复渲染 |
| ASCII 配置 | `pi > unknown ? ---` |
| 非法 ASCII 配置 | 两条 warning + 安全默认 |
| footer A/B | native 模式 footer 与未安装扩展逐字一致（该状态） |
| replace 配置 | 两行实验 footer + 启动 warning |
| 30/150 列 resize | 无溢出、无换行 |

## 4. 已知阻断与未验证

1. **G0-Data 真实数据**：本机无认证模型，未捕获真实 `message_update`/usage 事件；usage 账本只经 fixture 单测。不得宣称真实数据集成已验收。
2. **G3 鼠标/IME**：单元测试覆盖坐标映射；Ghostty 中文 IME、拖选、补全点击未手工验证。
3. **G5 共存**：未在真实会话中并行 TODO/Goal/Subagent/审批；未验证 20 行以下终端总高度。
4. **replace parity**：缺失字段无公开来源；保持 experimental，默认关闭。
5. **性能**：冷启动、RSS、长会话 heap 未测；热态微基准不能替代 P6 完整报告。
6. **发布**：未上传 npm、未打 tag、未做独立 Reviewer；不宣称 v1.0。

## 5. Definition of Done 对照

| ID | 状态 |
|---|---|
| A01 无私有字段/Reflect/deep import | 通过（源码审阅） |
| A02 分模式视觉 | 通过（PTY；native compact 4 段内） |
| A03 原生输入等价 | 部分（视觉/手动输入；未做字节级 A/B 提交对照） |
| A04 IME/鼠标 | 未完成 |
| A05 真实数据准确性 | 部分（算法 + 单测；真实 fixture 缺） |
| A06 生命周期无泄漏 | 部分（reload/preset PTY） |
| A07 ANSI/宽度/ASCII | 通过（单测 + PTY） |
| A08 其他 HUD/审批共存 | 未执行 |
| A09 原生 footer 保留 | 通过（范围）；replace blocked |
| A10 Powerline 互斥/回滚 | 文档完成；实测未做 |
| A11 性能/零 LLM | 部分（热态、零请求） |
| A12 pi-ui 回归 | 通过（pi-ui 106 用例） |
| A13 当前模式门禁 + Reviewer | 未通过 |
| A14 宽度矩阵 | 通过（单测） |
| A15 footerMode | native 通过；replace blocked |
| A16 文档/出口/commit 对账 | 文档已落盘；SHA 见下 |

## 6. Commit

- pi-ui：待首次提交后记录。
- pi-prompt：待首次提交后记录。
