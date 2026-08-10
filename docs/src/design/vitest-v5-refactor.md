# Tester 重构方案：全面对齐 Vitest v5

> 状态：设计稿（2026-08）
> 基准版本：Vitest `5.0.0-beta.7`（runner 已合并进 `vitest` 主包）
> 兼容性策略：**以 v5 为准，不兼容 v4，不考虑向后兼容**；重构完成后 scaffold 的 tester 将全面切换

## 1. 背景与目标

`zotero-plugin-scaffold` 的 tester 让插件测试运行在**真实 Zotero** 里（特权 chrome 上下文，可访问 `Zotero.*` 私有 API）。当前生产版本（0.8.x）沿用 Zotero 官方测试路线：mocha + chai 嵌入测试页面，通过自定义 HTTP 事件流上报结果。

原型阶段（v4）已验证核心可行性：vitest runtime（`@vitest/runner` + `vitest` 的 `expect`/`vi`）可被 esbuild 打包后嵌入 Zotero 页面独立运行，且宿主端可以用鸭子类型对象驱动 vitest 官方终端 reporter。

本方案的目标是把 tester **全面对齐 Vitest v5 生态**：

1. **Runner**：用 vitest v5 runtime 替换 mocha（第一阶段完成）
2. **Reporter**：宿主端复用 vitest v5 官方 reporter（`default`/`verbose`/`dot`/`json`/`junit`/`github-actions`）
3. **通信**：与 vitest 浏览器模式同构——WebSocket + birpc + flatted，增量 `TaskResultPack` + 生命周期事件，双向 RPC
4. **打包器**：测试文件打包从 esbuild 评估迁移到 rolldown-vite（vite 8），以获得 `vi.mock`/`vi.hoisted` 支持

## 2. 现状盘点

### 2.1 生产现状（0.8.x，mocha 路线）

```
Zotero 页面（chrome:// 窗口）                        宿主进程（node）
┌────────────────────────────┐    HTTP POST（每事件） ┌────────────────────┐
│ include.js（Zotero 全局）   │                        │ TestHttpReporter   │
│ mocha.js + chai.js（拷贝）  │ ────────────────────► │ （http server）    │
│ 测试文件（esbuild 打包）     │  start/suite/pass/    │  打印终端 + 退出码  │
│ 自定义 Reporter → send()    │  fail/pending/end     │                    │
└────────────────────────────┘                        └────────────────────┘
```

- 事件为"展示级"（标题 + 缩进），无 task 树，**无法驱动 vitest reporter**
- 单向通信，无取消、无 snapshot 回写能力
- mocha/chai 与 vitest 两套心智

### 2.2 v4 原型（已验证 ✅）

- **Runner 替换**：`@vitest/runner` 的 `startTests` + 自实现 `VitestRunner`（`importFile` 动态 `import()` esbuild 打包的 ESM 测试 chunk），`vitest` 主包的 `expect`/`vi`/`assert`（chai 兼容）——已在真实 Zotero 跑通（`zotero-format-metadata` 项目，module 脚本 + 动态 import + vi.fn + 失败 diff + 退出码全部验证）
- **Reporter 复用**：鸭子类型 `TestModule/TestCase/TestSuite` + 假 `ctx` 驱动 `DefaultReporter/VerboseReporter/DotReporter/JsonReporter/JUnitReporter` 全部输出正常（POC）
- 差距：仍走 HTTP 展示事件流；依赖 `@vitest/runner` 独立包（v5 已移除）；打包器仍是 esbuild

### 2.3 与 v5 的差距

| 维度            | v4 原型                     | v5 目标                              | 差距               |
| --------------- | --------------------------- | ------------------------------------ | ------------------ |
| runtime 入口    | `@vitest/runner` + `vitest` | `vitest/internal/browser` + `vitest` | import 路径迁移    |
| 官方 TestRunner | 存在但未用                  | 存在（耦合 worker state，仍不用）    | 自实现 runner 不变 |
| 通信            | HTTP 展示事件               | WS + birpc + flatted + 增量包        | 全新实现           |
| reporter        | 鸭子类型驱动（已验证）      | 同（v5 接口一致）                    | 小迁移             |
| 打包器          | esbuild                     | rolldown-vite（评估）                | 阶段四             |

## 3. 目标架构总览

```
Zotero 页面（chrome:// 窗口）                          宿主进程（node）
┌─────────────────────────────────┐   WebSocket 长连接  ┌──────────────────────────────────┐
│ include.js（Zotero 全局）        │   (birpc + flatted) │ WS Server（复刻 vitest 协议）     │
│ vitest-runtime.js（v5，打包）     │ ◄────────────────► │  onQueued / onCollected          │
│ 测试文件 chunk（打包，共享 runtime）│   页面→宿主：       │  onTaskUpdate(packs, events)     │
│ 自实现 VitestRunner               │   onTaskUpdate 等  │  sendLog / onUnhandledError      │
│  ├─ importFile: import()          │   宿主→页面：       │  snapshot 读写 / onCancel        │
│  ├─ onTaskUpdate → rpc           │   onCancel 等      ├──────────────────────────────────┤
│  └─ onAfterRunTask → 增量包       │                    │ VitestState（task 树镜像）        │
│                                  │                    │  ├─ updateTasks(packs)           │
│                                  │                    │  └─ getReportedEntity(task)      │
│                                  │                    │ Vitest v5 Reporter（官方）        │
│                                  │                    │  ├─ default/verbose/dot          │
│                                  │                    │  └─ json/junit（CI 输出）         │
└─────────────────────────────────┘                    └──────────────────────────────────┘
```

设计要点：

- **页面只跑 runner**（vitest runtime 打包产物），**宿主只跑 reporter**（vitest/node 导出），中间是**与 vitest 浏览器模式同构的 RPC 协议**
- 不引入 `@vitest/browser` 的 orchestrator/iframe（Playwright 驱动，与 Zotero 无关），只复刻其**协议层**（`packages/browser/src/types.ts` 的 `WebSocketBrowserHandlers/Events` 子集）
- 测试文件仍是构建期打包（chrome:// CSP 禁止运行时从 http 加载模块），打包器见阶段四

## 4. 关键设计决策

### D1. 自实现 `VitestRunner`，不用官方 `TestRunner`

v5 的官方 `TestRunner`（`vitest/src/runtime/runners/test.ts`）与 worker state 深度耦合（构造时 `getWorkerState()`、持有 `moduleRunner`、`rpc()` 直连 vitest server）。Zotero 页面没有 vitest worker，也没有 Vite 模块图。

**结论**：自实现 `VitestRunner`（v5 接口不变：`importFile`/`onCollected`/`onBeforeRunTask`/`onAfterRunTask`/`onTaskUpdate`/`onAfterRunFiles`），只依赖 `startTests` 与 runner 事件——v4 原型已验证该路径可行，v5 的 `VitestRunner` 接口（`packages/vitest/src/runtime/runner/types.ts`）与 v4 一致。

### D2. 通信协议复刻 vitest 浏览器模式

- 传输：WebSocket（宿主 `ws` 库，页面原生 `WebSocket`）
- 帧协议：`birpc`（JSON-RPC 风格）+ `flatted` 序列化（task 树存在 `file` 自引用，`JSON.stringify` 不可用；Error 特殊序列化）
- 页面→宿主 handlers（复刻 `WebSocketBrowserHandlers` 子集）：
  - `onQueued(file)` / `onCollected(files)`（收集）
  - `onTaskUpdate(packs, events)`（**增量**：`TaskResultPack = [taskId, result, meta]`；`TaskEventPack = [taskId, event, data]`）
  - `sendLog(log)`（测试内 console 转发）
  - `onUnhandledError(error, type)`
  - snapshot 三件套（`readSnapshotFile`/`saveSnapshotFile`/`removeSnapshotFile`）——阶段二可先留空实现
- 宿主→页面 events：`onCancel(reason)`（bail/用户中断）
- 进度语义：**每个测试完成立即发一个增量包**（`onAfterRunTask` → `onTaskUpdate`），宿主实时打印；与 vitest 浏览器模式完全一致

### D3. Reporter 复用 vitest v5 官方实现

- 从 `vitest/node` 导入 `DefaultReporter`/`VerboseReporter`/`DotReporter`/`JsonReporter`/`JUnitReporter`（v4.1 起 `vitest/reporters` 已废弃）
- 数据通路复刻 `TestRun.updated()` 三步：
  1. `state.updateTasks(packs)`（task 树镜像：`idMap` → `task.result/meta`）
  2. `reportEvent(id, event, data)`（生命周期事件 → `onTestModuleStart/End`、`onTestSuiteResult`、`onTestCaseResult`）
  3. `report('onTaskUpdate', packs, events)`
- `TestModule/TestCase/TestSuite` 无法外部构造（`#private` 字段）→ 鸭子类型包装（`state()/result()/ok()/meta()/task/project/module/children.allTests()`）——v4 POC 已验证全部字段与方法清单
- 假 `ctx`：`config`（root/hideSkippedTests/mode/silent/slowTestThreshold/...）+ `logger`（`printBanner/printError/onTerminalCleanup/...`）+ `projects`/`snapshot.summary`/`state.leakSet`/`onClose`
- TTY 全屏 summary（`SummaryReporter`/`WindowRenderer`）依赖较重，宿主端固定走非 TTY 路径

### D4. 打包器：阶段一保持 esbuild，阶段四评估 rolldown-vite

- **为什么保持 esbuild**：已真机验证；vitest runtime 本身可被 esbuild 打包（v5 需重新验证依赖图，重点 `vite/module-runner` stub）
- **为什么换 rolldown-vite（vite 8）**：唯一实质收益是 `vi.mock`/`vi.hoisted`——它们需要 Vite 的 transform 管线（mock 提升 + 模块图），esbuild 无法提供。vitest v5 官方已适配 rolldown（`plugins/config.ts` 有 `rolldownVersion` 检测）
- 落地形态：宿主进程在构建期用 rolldown-vite 的 `build`（或 vitest 的 transform 管线）把测试文件打成 ESM chunk 到 tester 插件内，页面运行时仍走静态 `import()`
- 风险：chrome:// 下模块加载语义、mock 提升后的运行时依赖（`__vi_import__` 等注入）需真机验证

### D5. 序列化统一用 flatted

task 树（`File`/`Suite`/`Test`）含 `file.file` 自引用与 `file` 指针，`JSON.stringify` 会抛循环引用错误。v4 原型用展平事件规避，v5 方案回传完整树/增量包，必须用 `flatted`（与 vitest 一致）。宿主端反序列化后直接还原 runner 原生结构，reporter 所需的 `task`/`result`/`meta` 字段零丢失。

## 5. 分阶段计划

### 阶段一：Runner 替换（v5 runtime 嵌入 Zotero）

**目标**：v4 原型迁移到 v5 API，真实 Zotero 跑通，通信暂保持 HTTP 事件流。

**改动清单**：

| 文件                                        | 改动                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/core/tester/test-bundler.ts`           | `VITEST_RUNTIME_ENTRY` 改为 v5 导入路径（见附录 A）；`@vitest/runner` 解析逻辑删除（v5 无独立包） |
| `test-bundler-template/raw/vitest-setup.js` | import 源改为 `vitest/internal/browser`；`__vitest_worker__` shim 按 v5 字段更新；其余不变        |
| `vitest-runtime.test.ts`                    | 集成测试迁移到 v5（子进程方案不变）                                                               |
| 文档                                        | `docs/src/test.md` 更新                                                                           |

**验收**：`zotero-format-metadata` 项目 `zotero-plugin test --no-watch` 全绿；`vi.fn`/失败 diff/pending/退出码行为不变。

### 阶段二：通信升级（WS + RPC 协议）

**目标**：与 vitest 浏览器模式同构的通信层，实时增量进度，双向能力（cancel）。

**改动清单**：

| 文件                                        | 改动                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/core/tester/ws-reporter.ts`（新）      | WS 服务端：birpc + flatted；handlers 复刻 `WebSocketBrowserHandlers` 子集                                    |
| `test-bundler-template/raw/vitest-setup.js` | `send()` 改为 `WebSocket` + birpc client；`onTaskUpdate`/`onCollected` 增量发送；`__PORT__` 语义变为 WS 端口 |
| `src/core/tester/index.ts`                  | `TestHttpReporter` 退役；启动/退出流程改为 WS 生命周期；`onZoteroExit` 判定改为从 task 树镜像读失败数        |
| `vitest-runtime.test.ts`                    | 子进程模拟 WS 服务端，断言增量包序列                                                                         |

**协议草案**（页面→宿主）：

```ts
// 连接即注册，无鉴权（localhost 专用，绑定 127.0.0.1）
onCollected(files); // 收集完成（完整 File[]，flatted）
onTaskUpdate(packs, events); // 每测试完成增量；end 时最后一批带 finish 事件
sendLog(log); // console 转发
onUnhandledError(error); // 页面级错误
```

**验收**：实时打印（每个测试完成终端即出 ✓/×）；`onCancel` 可中止运行（bail 场景）；断线重连页面侧有明确错误输出。

### 阶段三：Reporter 复用（vitest v5 官方 reporter）

**目标**：宿主端输出与 `vitest` CLI 一致；`json`/`junit` 白拿；`TestHttpReporter` 打印逻辑删除。

**改动清单**：

| 文件                                        | 改动                                                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/tester/reporter-adapter.ts`（新） | task 树镜像（`updateTasks` 复刻）+ `TestModule/TestCase/TestSuite` 鸭子类型 + 假 `ctx`（v4 POC 字段清单，v5 对齐 `reported-tasks.ts`） |
| `src/core/tester/ws-reporter.ts`            | 事件 → `reportEvent` 三步驱动 reporter                                                                                                 |
| `src/types/config.ts`                       | 新增 `test.reporter`（`default`/`verbose`/`dot`/`json`/`junit`）+ `test.outputFile`（json/junit 落盘）                                 |
| `vitest-runtime.test.ts`                    | 断言 reporter 输出（快照测试）                                                                                                         |

**验收**：`default` 输出与 vitest CLI 逐字符一致（除文件路径）；`junit` 产出可被 CI 解析；失败退出码不变。

### 阶段四：打包器与 mock 支持（评估）

**目标**：`vi.mock`/`vi.hoisted` 在 Zotero 内可用；打包器迁移 rolldown-vite。

**改动清单**：

| 文件                                        | 改动                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/tester/test-bundler.ts`           | esbuild → rolldown-vite `build` 管线（或 vitest 内部 transform 复用）；`vite/module-runner` stub 删除（rolldown 提供真实 ModuleRunner） |
| `test-bundler-template/raw/vitest-setup.js` | mock 运行时（`__vitest_mocker__`）初始化；`vi.mock` 工厂经 RPC 解析                                                                     |
| `vitest-runtime.test.ts`                    | `vi.mock` 用例（在子进程验证打包产物）                                                                                                  |

**风险**：mock 提升后的代码依赖 Vite 运行时注入（`__vi_import__`/`import.meta` 处理）；chrome:// 下模块加载语义变化；**需真实 Zotero 冒烟**。

**验收**：`vi.mock('./dep', () => ({...}))` 在真实 Zotero 生效；`vi.hoisted` 可用；打包体积/速度不劣于 esbuild 方案。

## 6. 风险与未决问题

| 风险                                                              | 等级 | 缓解                                                   |
| ----------------------------------------------------------------- | ---- | ------------------------------------------------------ |
| chrome:// 窗口的 `new WebSocket()` 未真机验证                     | 中   | 阶段二前先冒烟；HTTP 通道作为回退保留一个版本          |
| v5 处于 beta，API 可能变动                                        | 中   | 锁定基准版本号；阶段一完成后跑通即冻结 runtime API 面  |
| v5 runtime 的 esbuild 打包依赖图（`vite/module-runner` 等）未验证 | 中   | 阶段一集成测试先行（子进程可跑，不依赖 Zotero）        |
| `vi.mock` 提升产物在 chrome:// 的加载                             | 高   | 阶段四专设冒烟项；失败则保留 esbuild + 文档化限制      |
| snapshot 落盘方案（经 RPC 回写宿主文件）                          | 低   | 阶段二留空实现，阶段三按 vitest `snapshot.ts` 协议补全 |
| watch 模式的 WS 重连与窗口重建语义                                | 低   | 沿用现有"插件重载 → 新窗口 → 新连接"模型，无需重连     |

## 7. 附录

### A. v5 import 路径速查

| 用途                                 | v4                           | v5                                                      |
| ------------------------------------ | ---------------------------- | ------------------------------------------------------- |
| `startTests`/`collectTests`          | `@vitest/runner`             | `vitest/internal/browser`                               |
| `describe`/`it`/`test`/`suite`/hooks | `@vitest/runner`             | `vitest`（主入口）                                      |
| `expect`/`vi`/`assert`/`should`      | `vitest`                     | `vitest`（主入口）                                      |
| `VitestRunner` 类型                  | `@vitest/runner`             | `vitest`（或 `vitest/runtime`）                         |
| reporter                             | `vitest/reporters`（已废弃） | `vitest/node`                                           |
| 官方 `TestRunner`                    | `vitest`（内部）             | `vitest`（`runtime/runners/test`，仍耦合 worker，不用） |

### B. RPC 方法表（复刻自 `packages/browser/src/types.ts`）

| 方向      | 方法                           | 时机                      |
| --------- | ------------------------------ | ------------------------- |
| 页面→宿主 | `onQueued(file)`               | 文件排队                  |
| 页面→宿主 | `onCollected(files)`           | 收集完成                  |
| 页面→宿主 | `onTaskUpdate(packs, events)`  | 每测试完成 / 生命周期事件 |
| 页面→宿主 | `sendLog(log)`                 | console 输出              |
| 页面→宿主 | `onUnhandledError(error)`      | 页面错误                  |
| 页面→宿主 | `read/save/removeSnapshotFile` | snapshot 读写             |
| 宿主→页面 | `onCancel(reason)`             | bail / 中断               |

### C. 已验证事实清单（截至 2026-08）

- ✅ esbuild 打包 vitest runtime（v4）在真实 Zotero 运行（module 脚本 + 动态 import）
- ✅ `vi.fn`/chai 风格断言/失败 diff/pending/退出码（真实 Zotero）
- ✅ 鸭子类型驱动 `DefaultReporter`/`VerboseReporter`/`DotReporter`/`JsonReporter`/`JUnitReporter`（node POC）
- ✅ `@vitest/runner`（v4）脱离 Vite 独立运行
- ⚠️ v5 runtime 打包与运行（阶段一验证）
- ❌ chrome:// 下 WebSocket（阶段二验证）
- ❌ rolldown 打包 + `vi.mock`（阶段四验证）
