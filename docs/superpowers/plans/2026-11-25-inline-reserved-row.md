# Inline Reserved Row Implementation Plan

> **For OMP 原生执行层:** REQUIRED CONSUMER: OMP 原生执行层。按任务逐项执行本计划，步骤使用 checkbox（`- [ ]`）语法追踪。

**Goal:** 在 `footerMode=inline` 下把 Pi editor 槽位固定保留的第 3 行用于一行 path/branch/session/cost 元信息，实现 3 行总高度、无空白行、footer 为零行。

**Architecture:** 不修改 Pi 私有布局。`BandEditor` 仍在同一 `render` 中捕获原生边界，但 `composeFrame` 增加一个 `meta` 行，插在输入/滚动行之后、autocomplete 之前，正好占用宿主 `minSize: 3` 的第 3 行。`footerMode=inline` 通过 `EmptyFooter` 关闭原生 footer，并用现有 SegmentBar 渲染 meta 行。

**Tech Stack:** TypeScript、Pi 1.6.0 公开 `CustomEditor`/`setFooter`、`@jackice/pi-ui` SegmentBar、Vitest。

## Global Constraints

- 只使用 Pi 公开 API；不访问私有字段、不 Reflect、不 deep import、不 fork。
- `native` 行为不变；`hidden` 行为不变；`replace` 仍为实验模式。
- meta 行同步渲染，无 I/O、无定时器、无 LLM 请求。
- 所有输出行 `displayWidth <= width`；失败回退原生 render。
- 默认不启用 Git provider；只有配置了 Git/meta Git 段才启动。

## 文件结构规划

- `src/config.ts` — 新增 `footerMode: "inline"` 与 `metaSegments` schema/defaults/validation。
- `src/segments.ts` — 抽取可复用的 segment builder，新增 `buildMetaSegments`。
- `src/composer/frame.ts` — `meta` 行组合、RowMapping、鼠标行类型。
- `src/composer/native-editor.ts` — 从 source 读取 meta 行并交给 frame；鼠标映射。
- `src/integration/pi.ts` — inline 安装 EmptyFooter + editor meta provider；缓存与生命周期。
- `tests/unit/config.test.ts` — inline/metaSegments 校验。
- `tests/unit/frame.test.ts` — meta 行顺序、映射、宽度、autocomplete 联动。
- `tests/unit/band-editor.test.ts` — meta 行渲染、鼠标、回退。
- `tests/unit/segments.test.ts` — meta 段构造与优先级。
- `README.md` — English: footerMode 表格与 inline 效果。
- `docs/footer-parity.md` — inline 语义、行数、限制。
- `docs/compatibility.md` — 真机 PTY 证据。
- `CHANGELOG.md` — 0.1.2 英文条目。

## 目标视觉

空闲：

```text
π > GPT-6 Luna medium 0% ───────────────────────────── 272K
╰─
~/dev/src/github.com/jackice/dotfiles > feat/refactor-pi
```

多行 + 滚动：

```text
π > GPT-6 Luna medium 0% ───────────────────────────── 272K
╰─ line1
   line2
   ↑4 ↓0
~/dev/src/github.com/jackice/dotfiles > feat/refactor-pi
```

补全：

```text
π > GPT-6 Luna medium 0% ───────────────────────────── 272K
╰─ /prompt-ui
~/dev/src/github.com/jackice/dotfiles > feat/refactor-pi
completion row 1
completion row 2
```

行数对照：

| 模式 | 总行数（空闲、无 TODO） | 空白行 |
|---|---:|---|
| `native` | 5（band 2 + editor 空白 1 + footer 2） | 有 |
| `compact` | 4（band 2 + 空白 1 + footer 1） | 有 |
| `hidden` | 3（band 2 + 空白 1） | 有 |
| `inline` | 3（band 2 + meta 1） | 无 |

## Task 1: 配置 schema

**Goal:** `footerMode=inline` 与 `metaSegments` 可解析、校验、回退。

**Files:**
- Modify: `src/config.ts`
- Test: `tests/unit/config.test.ts`

**Boundaries:**
- Allowed: `src/config.ts`、`tests/unit/config.test.ts`
- Must not change: `src/composer/**`、`src/integration/**`

**Interfaces:**
- Produces: `FooterMode = "native" | "replace" | "compact" | "hidden" | "inline"`；`PromptConfig.metaSegments: SegmentId[]`；`DEFAULT_INLINE_META = ["path", "git", "session", "cost"]`。

**Acceptance:**
- `resolveConfig({footerMode:"inline"})` 返回 `hardError=false`，`metaSegments` 默认四项。
- 非法/重复/`context` meta ID 被忽略并产生诊断。
- `hidden`/`compact` 默认不变。

- [ ] **Step 1: 写失败测试**
  - Add test: inline 接受默认；未知/重复/context 被过滤；`shape=native` 仍可解析。
- [ ] **Step 2: 运行确认失败**
  - Run: `npx vitest run tests/unit/config.test.ts`
  - Expect: `footerMode=inline` 被视为非法。
- [ ] **Step 3: 最小实现**
  - Extend `FooterMode`、`resolveConfig`、`mergeBase`、`defaultConfig`；新增 `metaSegments` 解析（复用 `parseSegments` 的 ID 校验但不加入左/右组）。
- [ ] **Step 4: 验证**
  - Run: `npx vitest run tests/unit/config.test.ts && npx tsc -p tsconfig.json --noEmit`
  - Expect: 全部通过。

## Task 2: meta 段构造

**Goal:** 用现有 segment 定义生成 meta 行左右分组，无 gauge。

**Files:**
- Modify: `src/segments.ts`
- Test: `tests/unit/segments.test.ts`

**Boundaries:**
- Allowed: `src/segments.ts`、`tests/unit/segments.test.ts`
- Must not change: 现有 `buildBandSegments` 输出。

**Interfaces:**
- Produces: `buildMetaSegments(input: SegmentBuildInput, ids: readonly SegmentId[]): { left: SegmentSpec[]; right: SegmentSpec[] }`。

**Acceptance:**
- 默认 `["path","git","session","cost"]` 产出 path/git/session 左、cost 右。
- 非 repo 隐藏 git；cost 为 0 隐藏；未知 ID 不抛错。
- `buildBandSegments` 现有测试不变。

- [ ] **Step 1: 写失败测试**
  - Add test: 默认 meta ID、非 repo、cost=0、未知 ID。
- [ ] **Step 2: 运行确认失败**
  - Run: `npx vitest run tests/unit/segments.test.ts`
  - Expect: `buildMetaSegments` 未导出。
- [ ] **Step 3: 最小实现**
  - 抽取内部 `builders` 注册表为可复用函数；`buildMetaSegments` 只按传入 ID 构造，不添加 gauge。
- [ ] **Step 4: 验证**
  - Run: `npx vitest run tests/unit/segments.test.ts`

## Task 3: frame 组合与映射

**Goal:** `composeFrame` 插入 meta 行，并保证鼠标/补全映射正确。

**Files:**
- Modify: `src/composer/frame.ts`
- Test: `tests/unit/frame.test.ts`

**Boundaries:**
- Allowed: `src/composer/frame.ts`、`tests/unit/frame.test.ts`
- Must not change: 无 meta 时的现有行顺序。

**Interfaces:**
- Produces: `ComposeFrameOptions.meta?: string`；`RowMapping.kind` 增加 `"meta"`；meta 位于 inputs/scroll 之后、completions 之前。

**Acceptance:**
- 无 scroll：`status, input, meta`；mapping 为 `status,input,meta`。
- 有 scroll：`status, input, scroll, meta, completions`；completion `nativeY` 不变（仍按原生行计算）。
- meta 超宽/含换行 → 整帧回退 `undefined`。
- 无 meta 时现有测试全部保持。

- [ ] **Step 1: 写失败测试**
  - Add cases: meta 行顺序；completion 映射；超宽回退。
- [ ] **Step 2: 运行确认失败**
  - Run: `npx vitest run tests/unit/frame.test.ts`
- [ ] **Step 3: 最小实现**
  - `ComposeFrameOptions` 增加 `meta`；push/replace 行与 mapping；`handleMouse` 在 editor 侧把 meta 当 status 处理。
- [ ] **Step 4: 验证**
  - Run: `npx vitest run tests/unit/frame.test.ts`

## Task 4: BandEditor meta 行

**Goal:** editor 从 source 获取 meta，同步渲染并更新鼠标映射。

**Files:**
- Modify: `src/composer/native-editor.ts`
- Test: `tests/unit/band-editor.test.ts`

**Boundaries:**
- Allowed: `src/composer/native-editor.ts`、`tests/unit/band-editor.test.ts`
- Must not change: 无 meta 时 BandEditor 现有行为。

**Interfaces:**
- Produces: `BandEditorSource.renderMeta?(width: number): string | undefined`。
- Consumes: `composeFrame` 的 `meta` 选项。

**Acceptance:**
- source 提供 meta 时，空闲 render 为 3 行且第 3 行等于 meta。
- 点击 meta 行只聚焦，不移动光标。
- meta 渲染抛错/超宽 → 回退原生 render，不泄漏内部标记。
- `renderMeta` 不存在时保持当前 2 行行为。

- [ ] **Step 1: 写失败测试**
  - Add cases: 3 行、meta 内容、点击聚焦、异常回退。
- [ ] **Step 2: 运行确认失败**
  - Run: `npx vitest run tests/unit/band-editor.test.ts`
- [ ] **Step 3: 最小实现**
  - 读取 `source.renderMeta?.(width)`；校验单行；传入 `composeFrame`；`handleMouse` 对 `"meta"` 仅聚焦。
- [ ] **Step 4: 验证**
  - Run: `npx vitest run tests/unit/band-editor.test.ts`

## Task 5: 宿主集成 inline

**Goal:** `footerMode=inline` 安装零行 footer + editor meta；保留 reload/preset 生命周期。

**Files:**
- Modify: `src/integration/pi.ts`
- Test: `tests/unit/footer.test.ts`（如抽出 line builder）
- Manual: 真实 Pi PTY

**Boundaries:**
- Allowed: `src/integration/pi.ts`
- Must not change: `native`/`replace` 分支行为。

**Interfaces:**
- Consumes: `buildMetaSegments`、`layoutSegmentBar`、`EmptyFooter`、`runtime.footerData`。
- Produces: `renderMeta(runtime, width)`，缓存 key 与 `renderStatus` 同构；inline 下 `setFooter(() => new EmptyFooter())`。

**Acceptance:**
- inline 空闲：`status, input, meta` 三行，无 footer。
- 多行/滚动/补全：meta 在输入/滚动之后、补全之前。
- `/reload` 切回 `footerMode=native` 恢复原生 footer。
- `shape=native` + `footerMode=inline`：不安装 band editor，仅零 footer；不崩溃。
- 窄宽 meta 截断不溢出。

- [ ] **Step 1: 实现集成**
  - `start`：`footerMode !== "native"` 安装 footer；`inline` 用 EmptyFooter。
  - `installEditor`：source 增加 `renderMeta`。
  - `renderMeta`：按 `metaSegments` 构造、`layoutSegmentBar`、右侧对齐、缓存。
- [ ] **Step 2: 单元验证**
  - Run: `npx vitest run && npx tsc -p tsconfig.json --noEmit`
- [ ] **Step 3: 真实 Pi PTY**
  - 隔离 `PI_CODING_AGENT_DIR`，`footerMode=inline`；验证空闲 3 行、无空白、多行、`↑N ↓M`、补全、`/reload`。
- [ ] **Step 4: 记录证据**
  - 更新 `docs/compatibility.md`、`docs/footer-parity.md`。

## Task 6: 文档、版本与发布

**Goal:** 交付 0.1.2，README 英文，更新本地配置。

**Files:**
- Modify: `README.md`、`CHANGELOG.md`、`package.json`
- Modify: `dotfiles/pi/.pi/agent/pi-prompt.json`

**Acceptance:**
- README 说明 `inline` 为无空白推荐模式；`hidden` 仍可能空白。
- 版本 `0.1.2`；测试、类型检查通过。
- npm `latest`/`next` 指向 0.1.2；GitHub tag + release。
- 本地 `footerMode=inline`，真实 Pi 显示 3 行无空白。

- [ ] **Step 1: 文档与版本**
- [ ] **Step 2: 全量验证**
  - Run: `npx vitest run && npx tsc -p tsconfig.json --noEmit && npx tsx examples/gallery.ts`
- [ ] **Step 3: 提交、推送、tag、发布**
- [ ] **Step 4: 更新本地配置并验证**

## 风险与停止条件

- 若 Pi 未来版本 editor `minSize` 不是 3，inline 会多出一行；以 PTY 实测为准，不假设。
- 若 meta 行导致 completion 点击坐标回归，停止发布并回退。
- 若 `shape=native` + `inline` 组合无法安全处理，配置校验应拒绝并提示，而不是静默覆盖。
- 不修改 `hidden` 的空白语义，不声称能消除它不是 inline 的情况。
