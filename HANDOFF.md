# 交接文档：vitest pool 测试系统（阶段 0–2 + 多 project 支持完成）

> 状态快照：2026-08-10，分支 `vitest-runner`。本文供接手者快速恢复上下文。

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
| 未提交              | 多 project 支持改造（见 §3）                                                                                                                                                           |

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
├── bundler.ts          # buildTesterPlugin：runtime chunk + page 源码(?raw) + 测试文件 + manifest
├── test-bundler.ts     # findImpactedTests（watch 资产，已瘦身）
├── template/           # 插件静态文件（manifest/bootstrap/index.html，__TESTER_PLUGIN_ID__ 占位）
├── page/               # 页面运行时（TS 源码 → rolldown → content/setup.js）
│   ├── index.ts        # 入口：全局注入 + transport/protocol 组装
│   ├── protocol.ts     # 协议状态机（start/run/collect/stop + rpc 分流）★ post() 待修
│   ├── rpc.ts          # birpc 客户端 + flatted 序列化 ★ serialize 与 protocol.post 重复
│   ├── runner.ts       # ZoteroVitestRunner + patchRunner（resolveTestRunner 复刻）★ name 必须透传 config.name（§4）
│   ├── transport.ts    # Zotero.HTTP.request 客户端（/post /poll /ready /debug）
│   ├── state.ts        # WorkerGlobalState 模拟
│   └── tests-manifest.ts  # tsc 占位（bundler 虚拟模块替换）
├── pool/
│   ├── index.ts        # zoteroPool() 公共入口 + ZoteroPool 类型（多 project + groupOrder 文档）
│   ├── pool-worker.ts  # PoolWorker：资源检测/派生 + bridge + ZoteroRunner（findResourceConflict 守卫）
│   ├── http-bridge.ts  # /post /poll /ready /debug（调试日志已清理）
│   ├── options.ts      # 选项解析 + project name 资源派生 ★ 改造未提交
│   └── index.test.ts / pool.test.ts / bundler.test.ts
└── headless.ts         # Linux headless（保留）
```

## 6. 真机验证环境

- Zotero beta：`D:/Code/zotero/tools/zotero-beta-build/zotero.exe`（env `ZOTERO_PLUGIN_ZOTERO_BIN_PATH`）
- 验证项目：`d:/Code/zotero/northword/zotero-format-metadata`（node_modules/zotero-plugin-scaffold 为 symlink 指向 scaffold 根，dist 即时生效；vitest 4.1.10）
- 命令：`cd zotero-format-metadata && ZOTERO_PLUGIN_ZOTERO_BIN_PATH=... npx vitest run --config zotero.vitest.config.ts`
- **当前验证结果（提交 5e3738e 后全绿）**：
  - 顶层 pool 版（`zotero.vitest.config.ts`）：2 files 5 tests ✓
  - projects 版（`vitest.config.ts`）：`--project=z-a` 4/4 ✓、`--project=z-b` 1/1 ✓、`--project=z-a --project=z-b` 5/5 ✓
  - 全量 `vitest run`（unit + z-a + z-b）需在 unit project 加 `sequence: { groupOrder: 1 }`（vitest maxWorkers 分组约束，见 §4）
- 注意：Zotero 偶发启动失败（无页面）需清理 `.scaffold` 重跑；`powershell "Get-Process zotero | Stop-Process -Force"` 清理残留；`close timed out after 10000ms`/`something prevents ... exiting` 为 vitest 自定义 pool 噪音（退出码正确，不阻塞）

## 7. 遗留事项

1. ~~修复 projects + custom pool 的 rpc 消息丢失~~ → **已解决（提交 `5e3738e`，真根因是 File 任务 id 缺 project name，§4）**
2. ~~清理调试日志~~ → **已清理**（`http-bridge.ts`、`protocol.ts`、`runner.ts`、`page/index.ts`）
3. ~~提交多 project 改造~~ → **已提交并真机验证**（`5e3738e`；多 zotero 项目同跑为串行 Zotero——vitest 池 maxWorkers=1，非并行，文档已注明）
4. `close timed out after 10000ms` 警告（退出码正确、进程干净，vitest custom pool 噪音，不阻塞；若想消掉可研究 worker `stop()` 里 Zotero 退出等待）
5. 阶段 3：reporter/outputFile 透传、watch 语义（`findImpactedTests` 接入）、WS 评估；混合测试示例文档（`docs/src/test.md` 已更新示例）
6. 阶段 4：vitest v5 迁移 + vi.mock 评估
7. 已知坑（勿重踩）：python 字符串替换在 eslint 格式化后静默失败（改文件用 write 或行级匹配）；`\\n` 经工具层转义（用 `chr(92)+"n"`）；eslint --fix 会重排 if/import（替换前先看实际格式）；Windows 下编辑器会写 CRLF（`core.autocrlf=input` 下 `git diff` 报假差异，提交前先转 LF）；**改页面/协议相关代码后 dist 需 `pnpm build:tsdown` 重建**（验证项目 symlink 直接吃 dist，且 `dist/core/tester/page/*.ts` 是源码拷贝）
