# 交接文档：vitest pool 测试系统（阶段 0–2 完成，多 project 支持进行中）

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

| 提交 | 内容 |
|---|---|
| `2a0b5dd` | 阶段 0：`page/`（协议/rpc/runner/transport/state 源码化）、`pool/`（zoteroPool/worker/bridge/options）、`bundler.ts`（?raw 内联模板+page）、`template/`、测试 |
| `098638c` `f6f7928` | ZoteroRunner 复用（删重复 launcher）；`connectRDP` 默认从 `asProxy` 推导 |
| `ebc76e6` | 阶段 1：`zotero-plugin-scaffold/vitest` 导出、真机验证（zotero-format-metadata 4/4） |
| `a229ddc` | `canReuse`：单 Zotero 跑多文件（需 `isolate:false` + `fileParallelism:false`，pool 校验报错） |
| `00ec5b7` | 阶段 2：CLI 薄封装（`cli-config.ts` 生成配置 + spawn vitest）；退役 `http-reporter.ts`/`test-bundler-template/`/`vitest-runtime.test.ts`；`test-bundler.ts` 瘦身为 `findImpactedTests` |
| `a5e3bc7` | 修复：恢复 `ZoteroPool` 公共签名（阶段 1 修改曾丢失）；`zoteroPool()` 单次调用限制 |
| 未提交 | 多 project 支持改造（见 §3） |

## 3. 进行中：多 project 支持（未提交）

**需求**：用户可能有大量测试，按模块分多个 project，开发时 `vitest --project=xxx` 只跑对应模块；全部跑时也应有合理行为。

**已完成的改造**（工作区未提交）：
1. 移除 `zoteroPool()` 单次调用限制（允许多 project 配置）
2. `resolveOptions(options, projectName)`：`profileDir`/`dataDir` 按 project name 派生（`.scaffold/tester-profile-<name>`），tester 插件目录同步派生——多 project 并行时各自独立 Zotero（**Zotero 允许多实例，限制只在同一 profile/database 的互斥**）
3. `findResourceConflict`：共享资源的 worker 并行时抛错（显式指定相同 profileDir 的兜底）

**已修复**：页面全局注入（`describe/it/expect/...`）兼容旧 mocha 风格测试文件。

## 4. 阻塞问题：projects + custom pool 的 rpc 消息丢失

**现象**：`projects: [{ test: { pool: zoteroPool() } }]` 时，测试文件能加载（importFile 执行），但 vitest 报 "No test files found"（`onCollected` 未生效）；非 projects（顶层 `pool: zoteroPool()`）正常。

**已确认的事实链**（调试日志）：
1. 页面发出 rpc 消息：`[post] string:[{"m":"1",...},"onCollected",...]`——**注意页面 post 收到的是字符串**（birpc 已 serialize）
2. bridge 收到：`[bridge] /post type=?`——**type=? 说明 bridge parse 后 message 不是对象**（数组）
3. 根因嫌疑：**双重 flatted 序列化**——`page/rpc.ts` 的 birpc `serialize` 用 flattedStringify，`page/protocol.ts` 的 `post()` 又对已序列化的字符串再 `flattedStringify`（flatted 对字符串返回 `["<字符串>"]` 数组包裹）→ bridge parse 后是数组 → vitest 的 birpc 无法解析 → rpc 消息丢失
4. **疑点**：非 projects 模式同样双重序列化却正常——未解释（可能 vitest 侧对数组消息的容错差异，或非 projects 的 state 填充路径不同），需修复后回归确认

**修复方向**：`protocol.ts` 的 `post()` 区分字符串与对象：
```ts
const body = typeof message === "string" ? message : flattedStringify(message, errorReplacer);
await this.transport.post(body);
```
（birpc 消息已序列化，直接透传；协议消息（started/testfileFinished 等）是对象，需要序列化）

**修复后验证**：`zotero-format-metadata` 的 projects 配置（`test/tests/pool.spec.*` + `items.spec.*`）应 2 files 全绿；再回归非 projects 顶层 pool 配置。

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
│   ├── runner.ts       # ZoteroVitestRunner + patchRunner（resolveTestRunner 复刻）
│   ├── transport.ts    # Zotero.HTTP.request 客户端（/post /poll /ready /debug）
│   ├── state.ts        # WorkerGlobalState 模拟
│   └── tests-manifest.ts  # tsc 占位（bundler 虚拟模块替换）
├── pool/
│   ├── index.ts        # zoteroPool() 公共入口 + ZoteroPool 类型（★ 多 project 改造未提交）
│   ├── pool-worker.ts  # PoolWorker：资源检测/派生 + bridge + ZoteroRunner ★ 改造未提交
│   ├── http-bridge.ts  # /post /poll /ready /debug（★ 有调试日志待清理）
│   ├── options.ts      # 选项解析 + project name 资源派生 ★ 改造未提交
│   └── index.test.ts / pool.test.ts / bundler.test.ts
└── headless.ts         # Linux headless（保留）
```

## 6. 真机验证环境

- Zotero beta：`D:/Code/zotero/tools/zotero-beta-build/zotero.exe`（env `ZOTERO_PLUGIN_ZOTERO_BIN_PATH`）
- 验证项目：`d:/Code/zotero/northword/zotero-format-metadata`（node_modules/zotero-plugin-scaffold 为 symlink 指向 scaffold 根，dist 即时生效）
- 命令：`cd zotero-format-metadata && ZOTERO_PLUGIN_ZOTERO_BIN_PATH=... npx vitest run --config zotero.vitest.config.ts`
- 单 project 回归配置（顶层 pool）：当前 `zotero.vitest.config.ts` 内容即顶层 pool 版（2 files 5 tests 通过）
- 注意：Zotero 偶发启动失败（无页面）需清理 `.scaffold` 重跑；`powershell "Get-Process zotero | Stop-Process -Force"` 清理残留

## 7. 遗留事项

1. **修复 projects + custom pool 的 rpc 消息丢失**（§4，当前阻塞）
2. 清理调试日志：`http-bridge.ts` 的 `[bridge] /post` 日志、`protocol.ts` 的 `[post]`/`[proto]` dump、`runner.ts` 的 `[importFile]`/`[runMethod]` dump、`page/index.ts` 的 `(globalThis as any).dump` 挂载
3. 提交多 project 改造（§3）+ 真机验证双 project 并行（两个独立 Zotero）
4. `close timed out after 10000ms` 警告（退出码正确、进程干净，vitest custom pool 噪音，不阻塞）
5. 阶段 3：reporter/outputFile 透传、watch 语义（`findImpactedTests` 接入）、WS 评估
6. 阶段 4：vitest v5 迁移 + vi.mock 评估
7. 已知坑（勿重踩）：python 字符串替换在 eslint 格式化后静默失败（改文件用 write 或行级匹配）；`\\n` 经工具层转义（用 `chr(92)+"n"`）；eslint --fix 会重排 if/import（替换前先看实际格式）
