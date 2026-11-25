# 性能记录

## 1. 已测（同进程、热态）

命令：`npx tsx scripts/bench.ts`（2026-11-25，Node v25.9.0，macOS arm64）

| 场景 | 样本 | median | P95 | max |
|---|---:|---:|---:|---:|
| 状态带 build + layout（多分段） | 2000 | 0.015 ms | 0.023 ms | 1.538 ms |
| 状态带 build + layout（默认 native compact） | 2000 | 0.007 ms | 0.012 ms | 0.037 ms |
| `BandEditor.render`（24 行、20 行草稿滚动） | 1000 | 0.009 ms | 0.015 ms | 0.852 ms |

对照首版预算：

| 指标 | 预算 | 实测 |
|---|---:|---:|
| cache hit render P95 | ≤1 ms | 未单测（热态 layout <0.03 ms） |
| snapshot update P95 | ≤5 ms | 未单测 |
| 按键新增 render P95 | ≤2 ms | BandEditor 0.015 ms |
| streaming 重绘 | ≤10 Hz | 代码限制为 100 ms trailing |
| 冷启动增量 median | ≤30 ms | **未测** |
| 空闲 RSS 增量 | ≤5 MiB | **未测** |
| 默认轮询/常驻进程 | 0/0 | 0/0（仅显式 poll 或 clock） |
| 新增 LLM 请求/token | 0/0 | 0/0（真实 Pi 未发请求） |
| Git 并发 | ≤1 子进程 + 1 pending | 代码保证 |

## 2. 说明

- 以上为热态微基准，不含 Pi 启动、模块加载、JIT、GC、终端渲染与真实模型流。
- 未做 20 次交替冷启动、RSS/RSS-GC、1000 条工具结果长会话压测；这些属于 P6 剩余项，不能把本表当作完整性能验收。
- 状态带在 controller 内按 `width + facts.revision + configRevision + themeVersion + icons + extensionStatuses` 缓存；输入按键不改变 facts 时直接复用状态行。
- Git 只在配置启用时运行；默认 0 轮询。
