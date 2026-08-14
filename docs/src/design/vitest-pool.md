# Vitest Pool：Zotero 测试池架构

> 状态：实现完成（2026-08），基准 vitest `5.0.0-beta.7`
> 兼容性策略：**以 v5 为准**（`@vitest/runner`/`@vitest/utils` 已合并进主包；`serializeError` 等旧入口不再导出）；peer `vitest` 为 `^5.0.0-beta.0`

## 1. 架构总览

`zotero-plugin-scaffold` 的 tester 让插件测试运行在**真实 Zotero** 里（特权 chrome 上下文，可访问 `Zotero.*` 私有 API）。实现方式是 vitest **custom pool**：不封装 vitest，而是让 vitest 原生驱动 Zotero 测试——宿主侧 reporter/过滤/退出码全部由 vitest 原生提供。

```
用户项目（vitest CLI / zotero-plugin test）
└─ vitest server：原生 reporter / watch / -t 过滤 / shard / coverage / 退出码
   └─ zoteroPool()（PoolRunnerInitializer 官方扩展点，scaffold 导出）
      ├─ start(): rolldown 打包 page 运行时 + 测试文件 → tester 插件（proxy 安装）
      │            → HTTP bridge（/post /poll /ready /debug）→ 启动真实 Zotero
      │            → 等页面 /ready 握手（Zotero 冷启动 15-30s；失败自动重试 3 次）
      ├─ 传输：POST /post（页面→宿主）+ GET /poll 150ms（宿主→页面），flatted 序列化
      └─ stop(): 按 profile 定向杀进程（树杀 + 孤儿 contentproc 清扫）
         └─ Zotero 测试窗口（chrome:// 特权页面）
            ├─ runtime.js（rolldown 打包 vitest 主包 + vitest/internal/browser + birpc + flatted）
            ├─ page 运行时（TS 源码 → setup.js）：
            │   ├─ 协议：镜像 vitest 官方 worker（start→started / run|collect→testfileFinished / stop→stopped
            │   │         + birpc 消息，按 __vitest_worker_request__ 分流）
            │   ├─ rpc：createBirpc + flatted（任务树含 file.file 自引用，JSON 会抛 cyclic）
            │   └─ runner：startTests/collectTests（vitest/internal/browser）+ 轻量 VitestRunner
            │       （importFile 动态 import 打包产物；回调包装复刻 resolveTestRunner）
            └─ tests/*.js（rolldown 多入口，import "../runtime.js"）
```

设计要点：

- **宿主侧零复刻**：vitest server 的 state 层自己构造 TestModule/TestCase，页面只回传 `File[]`/`TaskResultPack`
- **页面侧零伪造**：消息协议镜像官方 `init()`（`vitest/worker`）；全局注入走官方 `setupCommonEnv`（同 `globals: true` 路径）
- **测试文件构建期打包**（chrome:// CSP 禁止运行时加载 http 模块——这是与 vitest browser mode 的根本分野）
- **双轨**：`zoteroPool` 导出（用户自配 vitest.config，支持 projects 混合测试）+ `zotero-plugin test` CLI（薄封装：生成临时配置 + spawn vitest）

## 2. 关键设计决策

### D1. 页面侧 runner：官方入口 + 轻量 VitestRunner

- 官方 `TestRunner` 耦合 vite `moduleRunner`/worker state，chrome:// 不可用
- 结论：页面用 `startTests`/`collectTests`（官方入口，`vitest/internal/browser`）+ 自实现轻量 `VitestRunner`（`importFile` 动态 import 打包产物），回调包装复刻 `resolveTestRunner` 的 `onQueued/onCollected/onTaskUpdate` 上报
- runner 的 config 必须**透传 `name`**（见 D6）

### D2. 通信协议：镜像官方 worker 协议

- `{__vitest_worker_request__: true, type: start|run|collect|stop}` + birpc 消息同通道分流
- 传输层 HTTP 轮询（150ms）；WS 已探测可用（chrome:// 下 `new WebSocket` 不抛、真实发起连接）但**未升级**——轮询延迟可接受、双通道维护成本高
- 页面 run/collect 处理**串行化**（`runChain`）+ generation 只保留最新：连续变更时 vitest cancel 旧 run，过期 run 的响应会被新 runner 误收（结果错配）；过期 run 排队期跳过、执行期丢弃响应

### D3. Reporter：vitest 原生，无适配层

- `TestConfig.reporter`/`outputFile` + CLI `--reporter`/`--output-file` 直接透传 vitest 配置（junit/json 免费获得）

### D4. 打包器：rolldown 构建期打包，page 运行时源码化

- `buildTesterPlugin`：runtime chunk + page 源码（?raw）+ 测试文件 + manifest；产物名带 stamp 前缀；`mode: full|tests-only`（watch 重建只打包测试文件）；`files` 选项（按 `context.files` 只重建本次要跑的文件）
- 页面运行时是 `src/core/tester/page/` TS 源码（可单测、同 lint/tsc 流程）
- `vi.mock` 不可用（见 §3）

### D5. 序列化统一用 flatted

- 任务树含 `file.file` 自引用，`JSON.stringify` 抛 cyclic；flatted 输出是 JSON 数组，解析侧必须 `flattedParse`
- **flatted 对字符串幂等往返**：`flattedParse(flattedStringify(str)) === str`——birpc 消息已被页面侧 serialize 为 flatted 字符串，`protocol.post` 对字符串直接透传（不双重序列化）

### D6. File 任务 id 依赖 project name（多 project 的关键坑）

- 服务端 spec 的 `taskId` = `hash(relative(root, moduleId) + projectName)`，`TestRun.end` 靠它回链 spec（`spec.testModule` getter）
- 页面 runner 的 config 必须透传 `name`（`serializedConfig.name`）；曾硬编码 `name: undefined` → projects 模式两边 hash 不同 → `onCollected` 注册的任务找不到 spec → "No test files found"（**rpc 消息没有丢**）
- 教训：`[bridge] /post type=?` 只是字符串消息的正常表现（flatted 解包），不是协议错误

### D7. 多 project 与 vitest 分组约束（groupOrder）

- vitest 按 `sequence.groupOrder` 分组，组内要求 `maxWorkers` 一致，否则报 `different 'maxWorkers' but same 'sequence.groupOrder'`
- `fileParallelism: false` ⇒ `maxWorkers = 1`；zotero 项目与并行项目混跑时，给并行项目配 `sequence: { groupOrder: 1 }`
- 多 zotero 项目同跑：池 `maxWorkers=1` → Zotero 逐个启动（串行），各自用按 project name 派生的 profile/data 目录

### D8. watch 实例复用：软停 + 接管

- vitest 每次 run 结束 stop pool worker（`queue` 空即 stop）→ 每次重跑冷启动 Zotero 要 ~30s
- **软停**：页面回 `stopped` 时 worker **立即**软停（早于 vitest 的 `worker.stop()`，防竞态误杀）——不杀 Zotero、不关 bridge，`liveInstances` 注册表按 profile 存，`process.once("exit")` 兜底清理
- **接管**：下一个 worker `start()` 查注册表 → `isPageAlive(2000)` 心跳检查（bridge 记录页面 poll 时间戳，替代 3-5s 的 PowerShell 进程探测）→ 复用 bridge（`setHandler` 重指）→ 模块级 `buildStampCounter` 重建产物——**stamp 必须跨 worker 唯一**，否则页面模块缓存返回旧代码（"No test suite found"）
- 冷启动兜底：接管失败时 `killZoteroByProfile`（树杀 `taskkill /f /t` + 孤儿 `-contentproc` 清扫）+ 1.5s 锁释放等待
- 测试文件变更：`maybeRebuild` 按 `context.files`（vitest 受影响文件集）只重建本次要跑的文件，manifest 经 `context.testerManifest` 下发，页面免 reload import 新 URL → 重跑 ~15ms
- 已知 vitest 固有噪音（非回归）：连续快速变更 → cancel 时 `waitForStart` 不 resolve → 60s 后报 `Timeout waiting for worker to respond` → 下一轮自愈

## 3. 当前能力与限制

### 能力

- **完整 vitest 体验**：reporter（default/verbose/dot/json/junit）、`outputFile`、`--project` 多项目、watch、退出码
- **vi 可用面**（真机逐一验证）：`vi.fn`/`vi.spyOn`/`vi.isMockFunction`/`vi.mocked`/`vi.stubGlobal`/`vi.clearAllMocks`/`resetAllMocks`/`restoreAllMocks`/`vi.useFakeTimers` 全家/`vi.setConfig`/`vi.stubEnv`/`vi.resetModules`/`vi.waitFor`/`vi.waitUntil`
- fake timers 可用依赖页面发布官方 worker state（`globalThis.__vitest_worker__`）——页面用自建 `WorkerStateLike`（官方 `WorkerGlobalState` 子集）
- **全局注入**：官方 `setupCommonEnv`（start 时强制 `config.globals = true`）——与 `globals: true` 同一代码路径，名单零维护
- **页面错误上报**：`template/index.html` 内联脚本把 window error/unhandledrejection POST 到 bridge `/debug`（`logger.warn` 显示 `[page-error]`）
- **日志分级**：`[zotero-pool]` 常规日志走 `logger.debug`（默认隐藏，`ZOTERO_PLUGIN_LOG_LEVEL=DEBUG` 或 config `logLevel` 开启）；启动重试/页面错误 `logger.warn` 默认可见

### 限制（架构性，非 bug）

- **`vi.mock`/`doMock`/`unmock`/`doUnmock`/`importActual`/`importMock`/`hoisted` 不可用**：mocker 拦截器（`@vitest/mocker/browser`）依赖 vite 模块管线，rolldown 打包 + 原生 ESM 页面无 import 拦截钩子（v4/v5 均实测确认）。潜在路径：构建期接 `hoistMocks` 转换 + import 重写到 mock 工厂产物（见附录 E）
- **`test.define` 不生效**：v5 非 browser 下 serializedConfig 不携带（进 `test.defines` 而序列化顶层 `defines`，为空；vite define 本就是构建期替换）
- **snapshot 不可用**：页面侧的 `PageHostRpc` 未接线 `read/save/removeSnapshotFile`（vitest browser 协议的 snapshot 读写走 RPC，池没有实现），`toMatchSnapshot` 在页面内不会工作。需要时请在测试里显式断言，或后续补上 snapshot RPC + snapshotEnvironment

## 4. 附录

### A. vitest 5 import 路径速查（已实测）

| 用途                                 | v4                                      | v5                                                                                         |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `startTests`/`collectTests`          | `@vitest/runner`                        | `vitest/internal/browser`（内部名 `publicCollect`，别名导出 `collectTests`）               |
| `describe`/`it`/`test`/`suite`/hooks | `@vitest/runner`                        | `vitest`（主入口）                                                                         |
| `expect`/`vi`/`assert`/`should`      | `vitest`                                | `vitest`（主入口）                                                                         |
| `processError`（错误序列化）         | `@vitest/utils/error`（serializeError） | `vitest/internal/browser`（`serializeError` 已不导出）                                     |
| `setupCommonEnv`（globals/defines）  | —                                       | `vitest/internal/browser`（不依赖 moduleRunner，页面可直接调用）                           |
| `VitestRunner` 类型                  | `@vitest/runner`                        | `vitest`（或 `vitest/runtime`）                                                            |
| reporter                             | `vitest/reporters`（已废弃）            | `vitest/node`                                                                              |
| `vite/module-runner`                 | —                                       | stub 需 `ModuleRunner` + `EvaluatedModules`（带 `getModuleSourceMapById`）+ `ssr*Key` 符号 |

### B. RPC 方法表（复刻自 `packages/browser/src/types.ts`）

| 方向      | 方法                           | 时机                      | 池内状态                          |
| --------- | ------------------------------ | ------------------------- | --------------------------------- |
| 页面→宿主 | `onQueued(file)`               | 文件排队                  | ✅ 已实现                         |
| 页面→宿主 | `onCollected(files)`           | 收集完成                  | ✅ 已实现                         |
| 页面→宿主 | `onTaskUpdate(packs, events)`  | 每测试完成 / 生命周期事件 | ✅ 已实现                         |
| 页面→宿主 | `sendLog(log)`                 | console 输出              | ❌ 未接线                         |
| 页面→宿主 | `onUnhandledError(error)`      | 页面错误                  | ❌ 未接线（经 `/debug` 通道上报） |
| 页面→宿主 | `read/save/removeSnapshotFile` | snapshot 读写             | ❌ 未接线（snapshot 不可用）      |
| 宿主→页面 | `onCancel(reason)`             | bail / 中断               | ✅ 已实现                         |

### C. 代码地图与维护

```
src/core/tester/
├── index.ts            # Test 类（CLI 薄封装：build → 生成配置 → spawn vitest）
├── cli-config.ts       # 临时 vitest.config 生成器（+ cli-config.test.ts）
├── bundler.ts          # buildTesterPlugin：runtime chunk + page 源码(?raw) + 测试文件 + manifest
│                       #   （返回 manifest；产物名 stamp 前缀；mode: full|tests-only；files: 按需打包）
├── template/           # 插件静态文件（manifest/bootstrap/index.html，__TESTER_PLUGIN_ID__ 占位）
├── page/               # 页面运行时（TS 源码 → rolldown → content/setup.js）
│   ├── index.ts        # 入口：组装 transport/protocol；globals 由 setupCommonEnv 注入（见 protocol.ts）
│   ├── protocol.ts     # 协议状态机（start/run/collect/stop + rpc 分流）；start 时调官方 setupCommonEnv
│   ├── rpc.ts          # birpc 客户端 + flatted 序列化（PageHostRpc 泛型）
│   ├── runner.ts       # ZoteroVitestRunner（name 透传 config.name；manifest 优先取 context.testerManifest）
│   ├── transport.ts    # Zotero.HTTP.request 客户端（/post /poll /ready /debug）
│   ├── state.ts        # WorkerStateLike（官方 WorkerGlobalState 子集，编译期契约校验）
│   ├── types.ts        # 页面消息契约（RunContext/PageCtx/PageHostRpc）
│   └── tests-manifest.ts  # tsc 占位（bundler 虚拟模块替换）
├── pool/
│   ├── index.ts        # zoteroPool() 公共入口 + ZoteroPool 类型（PoolRunnerInitializer 类型化）
│   ├── pool-worker.ts  # PoolWorker：软停/接管（watch 实例复用）、启动重试(3×25s)、资源冲突守卫
│   ├── http-bridge.ts  # /post /poll /ready /debug；isPageAlive 心跳（页面 poll 时间戳）
│   ├── options.ts      # 选项解析 + project name 资源派生
│   └── index.test.ts / pool.test.ts / bundler.test.ts
└── headless.ts         # Linux headless（保留）
```

**vitest 升级检查**（升级 vitest 后只需两步，无手写列表）：

1. 页面全局注入走官方 `setupCommonEnv`（`vitest/internal/browser`，start 时强制 `config.globals = true`）——与 `globals: true` 同一代码路径，名单零维护
2. `WorkerStateLike` 有编译期契约（`keyof` ⊆ 官方 `WorkerGlobalState`，字段改名/删除 tsc 报错）。验证：scaffold 单测（bundler.test 覆盖打包）+ 验证项目真机冒烟

**已知坑（勿重踩）**：

- 模板字符串拼接 PowerShell 脚本时，注释会诱发 eslint --fix 重排成 `` `${+`...`}` ``（一元加 → NaN 插值，脚本静默失败 → Zotero 残留）——用数组 join 拼接
- python 字符串替换在 eslint 格式化后静默失败（改文件用 write 或行级匹配）；`\n` 经工具层转义（用 `chr(92)+"n"`）
- eslint --fix 会重排 if/import（替换前先看实际格式）；Windows 编辑器写 CRLF（`core.autocrlf=input` 下 git diff 报假差异，提交前转 LF）
- 改页面/协议代码后 dist 需 `pnpm build:tsdown` 重建（验证项目 symlink 吃 dist，`dist/core/tester/page/*.ts` 是源码拷贝）
- execSync 传嵌套引号的 powershell 命令被 cmd 吞掉（用 `-EncodedCommand`）；git 把含 NUL 字节的文件当二进制（虚拟模块 id 用 `\0` 转义常量而非字面 NUL）

### D. 真机验证环境

- Zotero beta：`D:/Code/zotero/tools/zotero-beta-build/zotero.exe`（env `ZOTERO_PLUGIN_ZOTERO_BIN_PATH`）
- 验证项目：`d:/Code/zotero/northword/zotero-format-metadata`（node_modules/zotero-plugin-scaffold 为 symlink → scaffold 根，dist 即时生效；vitest 5.0.0-beta.7）
- 命令：`cd zotero-format-metadata && ZOTERO_PLUGIN_ZOTERO_BIN_PATH=... npx vitest run --config zotero.vitest.config.ts`
- 已验证（2026-08）：顶层 pool 2 files 5 tests；`--project=z-a` 4/4、`z-b` 1/1、双跑 5/5；全量 16 files / 107 passed；CLI junit 输出；watch 软停+接管重跑 ~15ms；类型化后 3 files 6 tests
- 已知噪音：`close timed out after 10000ms`/`something prevents ... exiting`（vitest 对 custom pool teardown 的时序问题，退出码正确不阻塞）；CLIXML `Preparing modules` 已修（killByProfile 脚本加 `$ProgressPreference='SilentlyContinue'`）
- 事实：Zotero 首启自重启（`lastAppBuildId` 置空所致），spawn 的 PID 是瞬时的——排查进程问题看命令行而非 PID

### E. 遗留事项

- ~~`close timed out after 10000ms` 噪音~~ → **已修复（提交 …）**：根因是 rolldown `1.0.0-rc.15` 每次 build 创建的 Rust 回调线程（napi threadsafe function）不释放，句柄挂住 vitest 进程 → 10s 后强制退出。升级 rolldown `1.1.3` 后干净退出；bundler 的 rolldown build 也补了 `close()`；CLI 配置加 `teardownTimeout: 1000` 兜底
- vitest v5 正式发布后：peer 版本 `^5.0.0-beta.0` → `^5.0.0`，重新验证一次
- CI/headless：`prepareHeadless`（Linux）需 Linux CI 真机验证（Windows 无法验证）
- `vi.mock`：潜在路径是构建期接 `@vitest/mocker` 的 `hoistMocks` 转换 + import 重写到 mock 工厂产物（不牺牲特权页面）
- `test.define`：暂不支持（见 §3 限制）
