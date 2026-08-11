# 交接文档：vitest pool 测试系统（阶段 0–4 完成）

> 状态快照：2026-08-11，分支 `vitest-runner`。本文供接手者快速恢复上下文。

## 1. 目标与架构

把 scaffold 的测试系统从"封装 vitest（mocha 路线）"重构为 **vitest custom pool 原生驱动**，双轨：

- **方案 B（核心）**：导出 `zoteroPool()`（`zotero-plugin-scaffold/vitest`），用户在自己的 `vitest.config.ts` 配置 `pool: zoteroPool()`，vitest 原生驱动 Zotero 测试
- **方案 A（薄封装）**：`zotero-plugin test` CLI 生成临时 vitest 配置并 spawn vitest

```
vitest CLI → zoteroPool() → pool-worker（HTTP bridge + ZoteroRunner 生命周期）
  → chrome:// 测试窗口（rolldown 打包的 vitest runtime + page 运行时）
  → 测试经 flatted RPC 回传 → vitest 原生 reporter/退出码
```

关键决策（详见 `docs/src/design/vitest-v5-refactor.md`）：

- 页面侧协议镜像 vitest 官方 worker（start/run/collect/stop + birpc 消息）
- 任务树含循环引用 → 序列化必须用 flatted
- 测试文件构建期 rolldown 打包（chrome:// CSP 禁止运行时加载）
- 只允许单 Zotero 实例串行跑一个 project 内的文件（`canReuse` + `isolate:false` + `fileParallelism:false`）

## 2. 已完成（提交记录）

| 提交                | 内容                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2a0b5dd`           | 阶段 0：`page/`（协议/rpc/runner/transport/state 源码化）、`pool/`（zoteroPool/worker/bridge/options）、`bundler.ts`（?raw 内联模板+page）、`template/`、测试                          |
| `098638c` `f6f7928` | ZoteroRunner 复用（删重复 launcher）；`connectRDP` 默认从 `asProxy` 推导                                                                                                               |
| `ebc76e6`           | 阶段 1：`zotero-plugin-scaffold/vitest` 导出、真机验证（zotero-format-metadata 4/4）                                                                                                   |
| `a229ddc`           | `canReuse`：单 Zotero 跑多文件（需 `isolate:false` + `fileParallelism:false`，pool 校验报错）                                                                                          |
| `00ec5b7`           | 阶段 2：CLI 薄封装（`cli-config.ts` 生成配置 + spawn vitest）；退役 `http-reporter.ts`/`test-bundler-template/`/`vitest-runtime.test.ts`；`test-bundler.ts` 瘦身为 `findImpactedTests` |
| `a5e3bc7`           | 修复：恢复 `ZoteroPool` 公共签名（阶段 1 修改曾丢失）；`zoteroPool()` 单次调用限制                                                                                                     |
| `5e3738e`           | 多 project 支持 + 阻塞修复（File 任务 id 缺 project name，见 §4）；protocol 透传清理；调试日志清理                                                                                     |
| `996dd2e`           | 阶段 3：reporter/outputFile 透传、watch 重跑（stamp + context manifest）、Zotero 启动重试、exit() 按 profile 定向杀进程、bundler NUL 修复（见 §8）                                     |
| 未提交              | 阶段 4：vitest 5.0.0-beta.7 迁移（import 路径、EvaluatedModules stub、processError、页面错误上报）+ vi.mock 评估（见 §9）                                                              |

## 3. 多 project 支持（已完成，提交 `5e3738e`）

**需求**：用户可能有大量测试，按模块分多个 project，开发时 `vitest --project=xxx` 只跑对应模块；全部跑时也应有合理行为。

**已完成的改造**（含修复）：

1. 移除 `zoteroPool()` 单次调用限制（允许多 project 配置）
2. `resolveOptions(options, projectName)`：`profileDir`/`dataDir` 按 project name 派生（`.scaffold/tester-profile-<name>`），tester 插件目录同步派生——多 project 各自独立 Zotero（**Zotero 允许多实例，限制只在同一 profile/database 的互斥**）
3. `findResourceConflict`：共享资源的 worker 并行时抛错（显式指定相同 profileDir 的兜底；注意 vitest 池 `maxWorkers=1` 使多 zotero 项目实际串行，此守卫目前几乎不可达，属保险丝）
4. **修复阻塞问题**（见 §4）：页面 runner 透传 `config.name`（关键！）
5. 页面全局注入（`describe/it/expect/...`）兼容旧 mocha 风格测试文件

## 4. 阻塞问题已解决：projects + custom pool 报 "No test files found"

**真根因（非 rpc 序列化！）**：File 任务 id 的 hash 算法包含 project name。

- 服务端：`TestSpecification.taskId = hash(relative(project.root, moduleId) + projectName)`（`createSpecification`）；`TestRun.end` 用 `spec.testModule` getter（`idMap.get(taskId)`）把收集到的任务回链到 spec
- 页面侧：`@vitest/runner` 的 `createFileTask` 用同一算法，但 `ZoteroVitestRunner` 构造时硬编码 `name: undefined` → 多 project（如 `z-a`）下两边 hash 不一致 → `onCollected` 注册的任务找不到 spec → 跑完报 "No test files found"（退出码 1）
- 非 projects 模式恰好两边 project name 都为空 → hash 一致 → 一直正常（这就是"同样的代码非 projects 正常"的谜底）

**修复**：`runner.ts` 中 `name: undefined` → `name: config.name`（`serializedConfig.name` 经 start 消息下发）。

**§4 旧分析的纠正**（勿再踩）：

- 旧结论"protocol.post 双重 flatted 序列化导致 rpc 丢失"是**错的**：`flatted.parse(flatted.stringify(str)) === str`（flatted 对字符串幂等往返），bridge 收到 `["<flatted>"` 会解包回字符串，`deserialize` 再解析成对象——链路完全正常
- `[bridge] /post type=?` 日志只是字符串消息的正常表现（`type`/`m` 属性在字符串上为 undefined），不是协议错误
- 排查"消息丢失"应验证：bridge parse → `worker.deserialize` → `emitWorkerMessage` → birpc `onMessage`（`msg.t === 0` 走 request 分支）→ `createMethodsRPC.onCollected` → `TestRun.collected` → `state.collectFiles` → `updateId` → `TestModule.register` → `idMap.set`
- 顺手做的协议清理（已提交）：`protocol.post` 对字符串直接透传不再二次序列化（层次更干净，行为等价）

**多 project 全跑（vitest run）的额外约束**（vitest 自身规则，已写入文档）：

- vitest 按 `sequence.groupOrder` 分组，组内要求 `maxWorkers` 一致，否则报 `different 'maxWorkers' but same 'sequence.groupOrder'`
- `fileParallelism: false` ⇒ `maxWorkers=1`；zotero 项目与默认并行项目（unit）混跑时，给并行项目配 `sequence: { groupOrder: 1 }`（组间顺序执行）
- 多个 zotero 项目同跑：池 `maxWorkers=1` → Zotero 逐个启动（串行），各自用派生的 profile/data 目录互不冲突

## 5. 关键文件地图

```
src/core/tester/
├── index.ts            # Test 类（CLI 薄封装：build → 生成配置 → spawn vitest）
├── cli-config.ts       # 临时 vitest.config 生成器（+ cli-config.test.ts）
├── bundler.ts          # buildTesterPlugin：runtime chunk + page 源码(?raw) + 测试文件 + manifest（返回 manifest；产物名支持 stamp 前缀）
├── test-bundler.ts     # findImpactedTests（watch 资产，已瘦身）
├── template/           # 插件静态文件（manifest/bootstrap/index.html，__TESTER_PLUGIN_ID__ 占位）
├── page/               # 页面运行时（TS 源码 → rolldown → content/setup.js）
│   ├── index.ts        # 入口：全局注入 + transport/protocol 组装
│   ├── protocol.ts     # 协议状态机（start/run/collect/stop + rpc 分流）post() 字符串直通
│   ├── rpc.ts          # birpc 客户端 + flatted 序列化
│   ├── runner.ts       # ZoteroVitestRunner（★ name 透传 config.name；manifest 优先取 context.testerManifest）
│   ├── transport.ts    # Zotero.HTTP.request 客户端（/post /poll /ready /debug）
│   ├── state.ts        # WorkerGlobalState 模拟
│   └── tests-manifest.ts  # tsc 占位（bundler 虚拟模块替换）
├── pool/
│   ├── index.ts        # zoteroPool() 公共入口 + ZoteroPool 类型（多 project + groupOrder 文档）
│   ├── pool-worker.ts  # PoolWorker：启动重试(3×25s)、watch 重建（stamp + context.testerManifest）、资源冲突守卫
│   ├── http-bridge.ts  # /post /poll /ready /debug
│   ├── options.ts      # 选项解析 + project name 资源派生
│   └── index.test.ts / pool.test.ts / bundler.test.ts
└── headless.ts         # Linux headless（保留）
```

## 6. 真机验证环境

- Zotero beta：`D:/Code/zotero/tools/zotero-beta-build/zotero.exe`（env `ZOTERO_PLUGIN_ZOTERO_BIN_PATH`）
- 验证项目：`d:/Code/zotero/northword/zotero-format-metadata`（node_modules/zotero-plugin-scaffold 为 symlink 指向 scaffold 根，dist 即时生效；vitest 5.0.0-beta.7）
- 命令：`cd zotero-format-metadata && ZOTERO_PLUGIN_ZOTERO_BIN_PATH=... npx vitest run --config zotero.vitest.config.ts`
- **当前验证结果（阶段 4 提交后全绿，零残留 Zotero 进程；scaffold 单测 72 passed 由 v5 跑）**：
  - 顶层 pool 版（`zotero.vitest.config.ts`）：2 files 5 tests ✓
  - projects 版（`vitest.config.ts`）：`--project=z-a` 4/4 ✓、`--project=z-b` 1/1 ✓、`--project=z-a --project=z-b` 5/5 ✓
  - 全量 `vitest run`（unit + z-a + z-b）：16 files / 107 passed | 1 skipped ✓（unit project 已加 `sequence: { groupOrder: 1 }`）
  - CLI：`zotero-plugin test --no-watch --reporter junit --output-file test-results/junit.xml` → junit.xml 6 tests ✓
  - watch（`vitest --watch`）：改测试文件 → 重跑（新 Zotero），pass→fail→pass 实测 ✓
- 注意：`close timed out after 10000ms`/`something prevents ... exiting` 为 vitest 自定义 pool 噪音（退出码正确，不阻塞）；Zotero 首启会自重启（`lastAppBuildId` 置空所致），spawn 的 PID 是瞬时的——排查进程问题看命令行而非 PID

## 7. 遗留事项

1. ~~修复 projects + custom pool 的 rpc 消息丢失~~ → **已解决（提交 `5e3738e`，真根因是 File 任务 id 缺 project name，§4）**
2. ~~清理调试日志~~ → **已清理**
3. ~~提交多 project 改造~~ → **已提交并真机验证**（`5e3738e`）
4. ~~阶段 3~~ → **已完成（提交 `996dd2e`）**：reporter/outputFile（`--reporter`/`--output-file`）、watch 重跑（stamp + context manifest；vitest 4 每次重跑重建 worker → 新 Zotero）、启动重试、exit() 定向杀进程、WS 探测（chrome:// 可用，未升级，见 §8）
5. `close timed out after 10000ms` 警告（退出码正确、进程干净，vitest custom pool 噪音，不阻塞；若想消掉可研究 vitest Pool 对 custom pool 的 teardown 时序）
6. ~~阶段 4~~ → **已完成**（vitest 5.0.0-beta.7 全链路；vi.mock 确认 v4/v5 均不可用，架构性限制；见 §9）。待办：vitest v5 正式发布后 peer 版本从 `^5.0.0-beta.0` 改为 `^5.0.0`
7. CI/headless：`prepareHeadless`（Linux）代码在，需 Linux CI 真机验证（本机 Windows 无法验证）
8. 已知坑（勿重踩）：python 字符串替换在 eslint 格式化后静默失败（改文件用 write 或行级匹配）；`\\n` 经工具层转义（用 `chr(92)+"n"`）；eslint --fix 会重排 if/import（替换前先看实际格式）；Windows 下编辑器会写 CRLF（`core.autocrlf=input` 下 `git diff` 报假差异，提交前先转 LF）；**改页面/协议相关代码后 dist 需 `pnpm build:tsdown` 重建**（验证项目 symlink 直接吃 dist，且 `dist/core/tester/page/*.ts` 是源码拷贝）；execSync 传含嵌套引号的 powershell 命令会被 cmd 吞掉（用 `-EncodedCommand`）；git 会把含 NUL 字节的文件当二进制（虚拟模块 id 用 `\0` 转义常量而非字面 NUL）

## 8. 阶段 3 实现备忘（提交 `996dd2e`）

- **reporter/outputFile**：`TestConfig.reporter`/`outputFile`（可选）+ CLI `--reporter`/`--output-file` → 生成的 vitest 配置 `reporters`/`outputFile`；junit/json 免费获得
- **watch 重跑机制**：vitest 4 在每次 run 结束后 stop pool worker（`queue` 空即 `runner.stop()`，custom pool 无跨 run 复用）→ 重跑=新 worker+新 Zotero+新页面。测试文件变更后：worker 的 `maybeRebuild`（run/collect 请求携带 `context.invalidates`，且 `hasRun` 已置位才重建——首个请求的 invalidates 是触发重启的过期值）→ `buildTesterPlugin` 全量重建，产物名带 stamp（`tests/<stamp>-<file>.js`，防页面模块缓存）→ run 请求 context 注入 `testerManifest`（覆盖 setup.js 内嵌清单）→ 页面 `importFile` 用新 URL。**页面免 reload**
- **Zotero 自重启**：`setupProfile` 置空 `extensions.lastAppBuildId/lastAppVersion` 强制 Zotero 首启后自重启 → `ZoteroRunner.zotero.pid` 是瞬时进程，真正的实例是重启后的新 PID。`exit()` 按 profile 路径匹配命令行杀进程（Windows：PowerShell `-EncodedCommand` + `Get-CimInstance`；Linux/macOS：`pkill -9 -f <profile>`）+ 原 PID 兜底。不要用 `taskkill /im zotero.exe`（误杀并行 project 实例）
- **启动重试**：worker `start()` 3 次 × `waitReady(25s)`（总预算 < vitest WORKER_START_TIMEOUT 90s），每次尝试新建 bridge+bundle+Zotero；强杀后 profile 锁未释放的场景实测触发过
- **WS 探测结论**：chrome:// 页面 `new WebSocket("ws://127.0.0.1:port")` 可用、CSP 不拦（实测构造函数不抛、真实发起连接）。未升级：轮询 150ms 延迟可接受、验收不含此项、阶段 4 会再碰协议层
- **`close timed out` 噪音**：每次 stop 都会出现，与 Zotero 退出无关（页面 `stopped` 响应正常），怀疑 vitest 对 custom pool teardown 的时序问题，不阻塞

## 9. 阶段 4 实现备忘（vitest 5.0.0-beta.7，未提交）

- **diff 面**：`page/runner.ts` + `page/protocol.ts` + `bundler.ts` + package.json + `template/index.html`
  - `@vitest/runner` 合并进 vitest 主包（v5 依赖只剩 `@vitest/mocker`）：
    - `startTests`/`collectTests` → `vitest/internal/browser`（v5 内部 `publicCollect`，导出别名 `collectTests`）
    - `describe`/`it`/hooks → `vitest` 主入口
  - `serializeError`（`@vitest/utils/error`）不再导出 → 页面用 `processError`（`vitest/internal/browser`）
  - `@vitest/runner`/`@vitest/utils` 从 dependencies 移除；peer `vitest` → `^5.0.0-beta.0`
  - bundler 的 `vite/module-runner` stub：`EvaluatedModules` 必须是类（带 `getModuleSourceMapById`），
    v5 顶层执行 `class VitestEvaluatedModules extends EvaluatedModules`，stub 成 undefined 会抛
    `class heritage (void 0) is not an object or null`（页面加载即炸，真机实测抓到）；另需 `ssr*Key` 符号
  - `template/index.html`：内联错误上报脚本（window error/unhandledrejection → bridge /debug）——
    **保留**，页面加载失败不再静默
- **vi.mock 结论**：`Vitest mocker was not initialized in this environment. vi.queueMock() is forbidden.`
  —— v5 mocker 拦截器（`@vitest/mocker/browser`）依赖 vite 模块管线，rolldown 打包 + 原生 ESM 页面
  无 import 拦截钩子，**v4/v5 均不可用**（架构性限制，已文档化）。可用替代：`vi.fn`/`vi.spyOn`/手动 DI
- **真机验证**（zotero-format-metadata，vitest 5.0.0-beta.7）：z-a 4/4、z-b 1/1、顶层 2 files 5 tests、
  全量 16 files / 107 passed | 1 skipped、CLI 3 files 6 tests —— 全绿，零残留进程
- **已知噪音**：`close timed out`/`something prevents N Vite servers from exiting`（v4/v5 均有，
  退出码正确不阻塞）。CLIXML 噪音已修（killByProfile 脚本加 `='SilentlyContinue'`）
- **日志级别**（后续改动）：pool/bundler/http-bridge 的 `[zotero-pool]`/`[zotero-page]` 日志全部改走
  scaffold 的 `logger`（复用）：正常流程 `logger.debug`（默认 INFO 隐藏，`ZOTERO_PLUGIN_LOG_LEVEL=DEBUG`
  或 config `logLevel` 开启）；启动重试/页面错误（`[page-error]`/`[page-unhandledrejection]`）`logger.warn`
  默认可见
- 坑：模板字符串内嵌反引号会终止字符串（TS 报 `';' expected`）；tsc 全量有 pre-existing 报错
  `test/e2e/fixtures/build.ts`（自引用包解析，非本改动引入）
