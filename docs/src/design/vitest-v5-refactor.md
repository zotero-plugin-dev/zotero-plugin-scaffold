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

## 3. 目标架构总览（custom pool 双轨）

**2026-08 更新**：`prototype/pool`（协议验证）与 `prototype/e2e`（真实 Zotero 全链路）已验证
custom pool 路线——不再"封装 vitest"，而是让 **vitest 原生驱动 Zotero 测试**。宿主侧 reporter/过滤/
退出码全部由 vitest 原生提供（reporter 鸭子类型方案作废）。

```
用户项目（vitest CLI / zotero-plugin test）
└─ vitest server：原生 reporter / watch / -t 过滤 / shard / coverage / 退出码
   └─ zoteroPool()（PoolRunnerInitializer 官方扩展点，scaffold 导出）
      ├─ start(): rolldown 打包 page 运行时 + 测试文件 → tester 插件（proxy 安装）
      │            → HTTP bridge（/post /poll /ready /debug）→ 启动真实 Zotero
      │            → 等页面 /ready 握手（Zotero 冷启动 15-30s，防 START_TIMEOUT）
      ├─ 传输：POST /post（页面→宿主）+ GET /poll 150ms（宿主→页面），flatted 序列化
      └─ stop(): taskkill 强杀 Zotero（SIGTERM 残留子进程，会卡住 Vite 关闭）
         └─ Zotero 测试窗口（chrome:// 特权页面）
            ├─ runtime.js（rolldown 打包 vitest + @vitest/runner + birpc + flatted）
            ├─ page 运行时（TS 源码 → setup.js）：
            │   ├─ 协议：镜像 vitest 官方 worker（start→started / run|collect→testfileFinished / stop→stopped
            │   │         + birpc 消息，按 __vitest_worker_request__ 分流）
            │   ├─ rpc：createBirpc + flatted（任务树含 file.file 自引用，JSON 会抛 cyclic）
            │   └─ runner：startTests/collectTests + 轻量 VitestRunner
            │       （importFile 动态 import 打包产物；回调包装复刻 resolveTestRunner）
            └─ tests/*.js（rolldown 多入口，import "../runtime.js"）
```

设计要点：

- **宿主侧零复刻**：vitest server 的 state 层自己构造 TestModule/TestCase，页面只回传
  `File[]`/`TaskResultPack`——reporter 鸭子类型、假 ctx、reportEvent 复刻全部不需要
- **页面侧零伪造**：不再手写 `__vitest_worker__` shim 与 RPC 上报——消息协议镜像官方
  `init()`（`vitest/worker`），`onQueued/onCollected/onTaskUpdate` 由包装后的 runner 回调直发 rpc
- **测试文件仍构建期打包**（chrome:// CSP 禁止运行时加载 http 模块）
- **双轨**：`zoteroPool` 导出（用户自配 vitest.config，支持 projects 混合测试）
  - `zotero-plugin test` CLI（薄封装：生成配置 + spawn vitest + 构建编排）

## 4. 关键设计决策

### D1. 页面侧 runner：官方入口 + 轻量 VitestRunner（自实现仍必要）

- 官方 `TestRunner` 耦合 vite `moduleRunner`/worker state（`getWorkerState()`），chrome:// 不可用
- `runBaseTests` 的 native 路径（`experimental.viteModuleRunner: false`）依赖 node 原生
  `import()`（`pathToFileURL`），浏览器不可用；`config.runner` 的自定义 runner 也经 moduleRunner 加载
- 结论：页面用 `startTests`/`collectTests`（官方入口）+ 自实现轻量 `VitestRunner`
  （`importFile` 动态 import 打包产物），回调包装逐行复刻 `resolveTestRunner` 的
  `onQueued/onCollected/onTaskUpdate` 上报（`prototype/e2e` 已验证）

### D2. 通信协议：镜像官方 worker 协议，不复刻浏览器模式

- 页面侧实现简化版 `init()`（`prototype/e2e/plugin/content/setup.js`）：
  `{__vitest_worker_request__: true, type: start|run|collect|stop}` + birpc 消息同通道分流
- 传输层 HTTP 轮询（已验证）；WS 升级见阶段三（chrome:// 下 `new WebSocket()` 未验证）
- 协议面 = vitest 官方 worker 协议子集（附录 B），不是浏览器模式的
  `WebSocketBrowserHandlers`（Playwright orchestrator 无关）

### D3. Reporter：vitest 原生，无适配层

- 原"鸭子类型 TestModule + 假 ctx"方案（v4 POC）**作废**——pool 模式下 vitest server
  自建任务树，`TestModule/TestCase` 由官方 state 层构造
- reporter 选项（default/verbose/dot/json/junit）与 `outputFile` 直接透传 vitest 配置

### D4. 打包器：rolldown（已随 vite-bundler 分支合并），page 运行时源码化

- `bundleVitestRuntime` 与测试文件打包已迁移 rolldown（`rolldown@1.0.0-rc.15`）
- 页面运行时从 raw 模板提升为 `src/core/tester/page/` TS 源码（可单测、同 lint/tsc 流程）
- `vi.mock` 仍不可用：vitest 4.1.4 native mocker 的 `rpc`/`interceptor` 未注入（注册链断裂，
  已实测）；打包产物的模块 id 与源码路径不一致加剧该问题——阶段四评估

### D5. 序列化统一用 flatted

- 任务树含 `file.file` 自引用，`JSON.stringify` 抛 cyclic（实测）；flatted 输出是 JSON 数组
  （不是对象）——解析侧必须 `flattedParse` 还原，不能 `JSON.parse`
- flatted 在 pnpm 虚拟店（非提升）：定位用 glob `.pnpm/flatted@*`（`bundler.ts` 已有实现）

## 5. 分阶段计划（双轨）

### 阶段 0：代码骨架落地（从原型到源码）

**目标**：`prototype/e2e` 的一次性代码 → `src/core/tester/` 正式结构，node 侧可测。

| 文件                                                                        | 改动                                                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/core/tester/page/{index,transport,protocol,rpc,state,runner}.ts`（新） | 页面侧运行时源码化（原型 setup.js 拆分）；协议状态机/rpc 构造/patchRunner 独立成模块                |
| `src/core/tester/pool/{index,pool-worker,http-bridge,options}.ts`（新）     | `zoteroPool()` 工厂 + PoolWorker + HTTP bridge + 选项类型                                           |
| `src/core/tester/bundler.ts`（新）                                          | 正式版 bundler：page/ 多入口 + 测试文件 + manifest + 插件生成（复用 test-bundler 的 rolldown 插件） |
| `src/utils/zotero-runner.ts`                                                | 复用（proxy 安装已支持）；ready 握手在 pool 侧（HTTP bridge）                                       |
| `src/core/tester/vitest-runtime.test.ts`                                    | 集成测试：bundler 产物 + 模拟 dispatch/rpc 跑协议层（子进程模式沿用）                               |
| `src/core/tester/pool.test.ts`（新）                                        | HTTP bridge 协议测试（mock 页面端消息流）                                                           |
| `template/`                                                                 | 静态文件（manifest/bootstrap/index.html）从原型迁移，不源码化                                       |

**验收**：tsc/lint 绿；测试全绿；bundler 产物结构 == 原型 out/。

### 阶段 1：`zoteroPool` 可用（方案 B 落地）

**目标**：用户项目 `vitest.config.ts` 配 `pool: zoteroPool(...)` 跑通真实 Zotero。

| 文件                                                 | 改动                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `tsdown.config.ts` + `src/core/tester/pool/index.ts` | 新入口 `zotero-plugin-scaffold/vitest`（导出 `zoteroPool` + 类型）                                                  |
| `pool/options.ts`                                    | `zoteroBin`/`profileDir`/`pluginDir`/`headless`/`abortOnFail`/`args`；env 作默认（`ZOTERO_PLUGIN_ZOTERO_BIN_PATH`） |
| `bundler.ts`                                         | 测试文件 entry 来自配置项（不再硬编码）                                                                             |
| `docs/src/test.md`                                   | 混合测试示例（projects：unit + zotero）                                                                             |
| 验证                                                 | `zotero-format-metadata`：`vitest run` 真机全绿 + 失败传播                                                          |

**验收**：真实 Zotero 端到端 + 退出码正确；`prototype/e2e` 标记 superseded。

### 阶段 2：CLI 薄封装（方案 A 落地）

**目标**：`zotero-plugin test` 行为与原型等价，内部即阶段 1 的池。

| 文件                                    | 改动                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/tester/index.ts`              | `Test` 类重写：`builder.run()` → 生成临时 vitest.config → spawn vitest（同仓库依赖）→ 退出码透传；watch 模式 spawn `vitest`（无 run） |
| `src/types/config.ts` + `src/config.ts` | `test.entries`→`include`、`test.vitest.timeout`→`testTimeout/hookTimeout`、`test.abortOnFail`→pool 选项、`test.headless`→launcher     |
| `src/core/tester/cli-config.ts`（新）   | 临时配置生成器（可单测）                                                                                                              |
| 退役                                    | `http-reporter.ts`、mocha 事件协议、`test-bundler-template/raw/vitest-setup.js` 删除；模板精简为 `template/`                          |
| 验证                                    | `zotero-format-metadata`：`zotero-plugin test --no-watch` 全绿 + 失败退出码 1                                                         |

**验收**：CLI 与直配 zoteroPool 行为一致（同一实现，双轨确认）。

### 阶段 3：能力补齐

| 项                  | 内容                                                                        | 优先级 |
| ------------------- | --------------------------------------------------------------------------- | ------ |
| reporter/outputFile | `test.reporter`/`test.outputFile` 透传 vitest reporters（免费 junit/json）  | 高     |
| 混合测试示例        | 文档 + 模板生成可选 vitest.config（projects 骨架）                          | 高     |
| WS 升级             | `http-bridge` → WS（先验证 chrome:// 下 `new WebSocket()`；不行则保留轮询） | 中     |
| watch 语义          | 页面侧 `?t=` 缓存失效（阶段 2 的 watch 需要）+ Zotero 热重载（RDP 复用）    | 中     |
| CI                  | headless 模式 + 无窗口运行验证                                              | 低     |

**验收**：混合项目单命令全绿；junit 输出可用；watch 改测试文件 → 重跑。

### 阶段 4：vitest v5 + vi.mock 评估

| 项      | 内容                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| v5 迁移 | 入口路径变化集中在 `page/`（import 来源）+ `bundler.ts`（resolve 表）；`@vitest/runner` 解析删除（附录 A）  |
| vi.mock | 评估 v5 native mocker 是否修复（rpc/interceptor 注入）；不行则接 vite transform 管线（rolldown-vite build） |
| 验收    | v5 + 真机全绿；vi.mock 可行则补 mock 用例                                                                   |

## 6. 风险与未决问题

| 风险                                  | 等级 | 缓解                                                                                    |
| ------------------------------------- | ---- | --------------------------------------------------------------------------------------- |
| 页面侧协议与 vitest 版本耦合（v4→v5） | 中   | `page/` 集中所有 vitest import；阶段 4 的 diff 面 = 2 个文件                            |
| WS 在 chrome:// 不可用                | 中   | 阶段 3 先验证；轮询是已验证的保底                                                       |
| 双轨配置漂移（CLI 生成 vs 手写）      | 低   | CLI 生成器输出可见的临时配置（`--show-config` 调试开关）                                |
| Zotero 冷启动慢（watch 场景）         | 中   | `canReuse` 实现（同一实例跑多轮）+ RDP 热重载                                           |
| `vi.mock` 提升产物在 chrome:// 的加载 | 高   | 阶段 4 专设冒烟项；失败则文档化限制                                                     |
| snapshot 落盘（经 RPC 回写宿主文件）  | 低   | vitest 官方 snapshot 协议（`read/save/removeSnapshotFile`）随 pool 通道自动可用，待验证 |
| Windows 上 Zotero 多进程残留          | 低   | `taskkill /f /im zotero.exe`（已验证）；scaffold 的 `killZotero` 复用                   |

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

- ✅ rolldown 打包 vitest runtime + 测试文件（`rolldown@1.0.0-rc.15`，集成测试验证，2026-08）
- ✅ esbuild 打包 vitest runtime（v4）在真实 Zotero 运行（module 脚本 + 动态 import，已被 rolldown 替代）
- ✅ `vi.fn`/chai 风格断言/失败 diff/pending/退出码（真实 Zotero）
- ✅ custom pool 协议验证（`prototype/pool`，fork 子进程模拟执行环境）
- ✅ **真实 Zotero 端到端**（`prototype/e2e`，2026-08）：vitest CLI → zoteroPool → HTTP bridge →
  真实 Zotero beta → chrome:// 测试窗口 → 4/4 通过、失败传播退出码 1、进程清理
- ✅ 页面侧简化 init 镜像官方 worker 协议（start/run/collect/stop + birpc + flatted）
- ✅ 鸭子类型驱动 `DefaultReporter`/`VerboseReporter`/`DotReporter`/`JsonReporter`/`JUnitReporter`（node POC，**方案已作废**，vitest server 原生驱动）
- ✅ `@vitest/runner`（v4）脱离 Vite 独立运行
- ⚠️ v5 runtime 打包与运行（阶段一验证）
- ❌ chrome:// 下 WebSocket（阶段二验证）
- ❌ rolldown 打包 + `vi.mock`（阶段四验证）
