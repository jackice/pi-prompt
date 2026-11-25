# Stacked Composer Implementation Plan

> **For OMP 原生执行层:** REQUIRED CONSUMER: OMP 原生执行层。按任务逐项执行本计划，步骤使用 checkbox（`- [ ]`）语法追踪。

**Goal:** 输入下方不留固定空行，配置只保留原生和零行底栏两种。

**Architecture:** `BandEditor` 保存 Pi 注入的原生状态指示器，`composeFrame` 将提示、状态、可用详情放在原生输入前。复用 Pi 公开 API、现有分段布局和零行 footer，保留原生生命周期。

**Tech Stack:** TypeScript、Vitest、Pi 1.6.0、tmux、npm、GitHub CLI。

## Global Constraints

- 遵循 `docs/superpowers/specs/2026-11-25-stacked-composer-design.md`；不调整 Pi 宿主布局或访问私有字段。
- 不继续执行旧 footer 模式，不静默接受旧配置。README 和 GitHub 发布说明使用英文。

## 文件结构规划

- `src/composer/frame.ts`、`src/composer/native-editor.ts`、`src/composer/shapes.ts`：行序、原生运行状态、鼠标/补全映射。
- `src/config.ts`、`src/segments.ts`、`src/integration/pi.ts`：配置、字段合并和去重、底栏生命周期。
- `src/footer.ts`、`tests/unit/footer.test.ts`：移除独立自定义底栏及其旧契约测试。
- `tests/unit/config.test.ts`、`tests/unit/frame.test.ts`、`tests/unit/band-editor.test.ts`、`tests/unit/segments.test.ts`：用户可见回归。
- `examples/gallery.ts`、`README.md`、`CHANGELOG.md`、`docs/{migration,compatibility,footer-parity}.md`、`package.json`：迁移所有使用方、发布和验收说明。
- 同级 `../dotfiles/pi/.pi/agent/pi-prompt.json`：发布后迁移本机配置并定向更新 pi-prompt，不改其他扩展。

### Task 1: 编辑器与配置切换（主会话）

- [x] 更新既有契约测试：空闲时首行非空，输入最后、补全坐标不变；`none` 接受，旧模式给出迁移提示；配置字段不重复。
- [x] 跑 `npm test -- tests/unit/config.test.ts tests/unit/frame.test.ts tests/unit/band-editor.test.ts tests/unit/segments.test.ts`，观察旧实现失败。
- [x] 实现 `BandEditor` 运行状态接收、`composeFrame` 新行序、`resolveConfig` 双值和 `none` 分段；清除旧自定义 footer。
- [x] 跑 `npm test && npm run typecheck`。源码、示例同时迁移。

### Task 2: 真实终端与发布（主会话）

- [x] 用隔离 `PI_CODING_AGENT_DIR` 启动 `pi --tui-mode fullscreen -e ./index.ts --no-session`，tmux 截取两模式空闲与运行、打开补全和窄窗口；用本地测试响应驱动运行提示，不访问用户模型。
- [x] 更新 README、迁移文档和兼容记录。两路只读评审发现极矮窗口鼠标裁剪、旧值字段迁移遗漏和 `none` 冲突缺少诊断；已修复，75 项测试、类型检查及 Pi PTY 复验通过。
- [ ] `npm pack` 后在隔离目录用 Pi 安装 tarball并启动，确认正确内容。选择性提交、推送 `develop`、发布 `0.2.0` 和 GitHub Release。
- [ ] 用 `npm view @jackice/pi-prompt dist-tags --json`、`gh release view v0.2.0` 和 `pi install npm:@jackice/pi-prompt` 核对公开发行；迁移本机并确认原有扩展未被批量更新。
