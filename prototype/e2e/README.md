# E2E Prototype — vitest custom pool 驱动真实 Zotero

在真实 Zotero 实例中跑通完整测试流程的最小原型（vitest 4.1.4 + rolldown）。

## 架构

```
vitest CLI (npx vitest run)
└─ vitest server：原生 reporter / 退出码 / 测试过滤
   └─ zotero-pool.ts（PoolRunnerInitializer 官方扩展点）
      ├─ start(): rolldown 打包 vitest runtime + 测试文件 → tester 插件
      │            → HTTP bridge (127.0.0.1:port) → 启动真实 Zotero
      │            → 等待页面 /ready 握手
      ├─ 传输：POST /post（页面→host，flatted 序列化）
      │         GET  /poll（host→页面，150ms 轮询）
      └─ stop(): taskkill 强杀 Zotero（SIGTERM 会残留子进程）
         └─ Zotero 测试窗口（chrome://zotero-test-e2e/）
            ├─ runtime.js（rolldown 打包 vitest + @vitest/runner + birpc + flatted）
            ├─ setup.js：简化版 init（消息协议镜像 vitest 官方 worker）
            │   ├─ dispatch: __vitest_worker_request__ → handleRequest
            │   │           否则 → birpc 回调
            │   ├─ rpc：createBirpc + flatted 序列化（任务树含循环引用）
            │   └─ ZoteroVitestRunner：importFile 动态 import 打包产物
            │       + resolveTestRunner 包装复刻（onQueued/onCollected/onTaskUpdate）
            └─ tests/*.js（rolldown 多入口打包，import "../runtime.js"）
```

## 验证结果（真实 Zotero beta）

| 验证点 | 结果 |
|---|---|
| custom pool → 真实 Zotero 全链路 | ✅ 4/4 通过，EXIT 0 |
| 失败传播（故意失败 → 退出码 1） | ✅ |
| 真实 Zotero API（`Zotero.Items`、`Zotero` 全局为 function） | ✅ |
| jest 风格 + chai 风格断言、`vi.fn` | ✅ |
| 页面错误回传（manifest 不匹配时 vitest 显示页面 stack） | ✅ |
| Zotero 进程清理 | ✅（taskkill /f /im zotero.exe） |

## 运行

```bash
cd prototype/e2e
ZOTERO_PLUGIN_ZOTERO_BIN_PATH="D:/Code/zotero/tools/zotero-beta-build/zotero.exe" npx vitest run
```

## 关键实现笔记（踩坑记录）

1. **协议**：页面侧简化 init 精确镜像 vitest 官方 worker 协议——
   `start`（回 started）→ `run`/`collect`（回 testfileFinished）→ `stop`（回 stopped）；
   rpc 消息（birpc 格式）与 request 消息同通道，按 `__vitest_worker_request__` 分流
2. **序列化必须用 flatted**：任务树含 `file.file` 自引用，JSON.stringify 抛 cyclic；
   flatted 输出是 JSON 数组（不是对象）——解析后必须 flattedParse 还原，不能 JSON.parse
3. **页面传输用 `Zotero.HTTP.request`**：chrome:// 页面 CSP 下裸 fetch 不可靠；
   body 传字符串（XHR 对对象自动 String() → `"[object Object]"`）
4. **prefs.js 首行必须是 `# Mozilla User Preferences`**：缺失时整块被移入 Invalidprefs.js
5. **插件 manifest 用 `applications.zotero` 命名空间**（非 gecko），
   `strict_min_version` 需匹配 Zotero 版本（"7.999"），加 `update_url` 字段
6. **插件以 proxy 方式安装**：profile/extensions/<id> 文件写入插件源目录绝对路径
7. **vitest 依赖解析**：require.resolve 走 require 条件会拿到 vitest 的 CJS 入口
   （执行即抛错）——必须读 exports 选 import 条件；flatted 在 pnpm 虚拟店需 glob 定位
8. **`?t=` 缓存失效会破坏 chrome:// 模块**：原型单次会话无需，已去掉
9. **Zotero 首次启动的 connector 安装页**：prefs `extensions.zotero.firstRun/firstRun2 = false`
10. **Zotero 冷启动 15-30s**：pool.start() 必须等页面 /ready 握手后再返回，
    否则 vitest 的 START_TIMEOUT 先触发

## 与 worker 原型的差异（prototype/pool/）

- worker 原型用 fork 子进程模拟 Zotero，验证协议层
- 本原型是真实 Zotero 端到端：打包、插件安装、页面加载、HTTP 桥接、进程清理全链路
- 两者共享同一消息协议，页面侧 setup.js 的 dispatch/rpc/runner 逻辑可直接演进为 scaffold 的正式实现

## 已知限制

- `vi.mock` 不可用（vitest 4.1.4 native mocker 的 rpc/interceptor 未注入；且打包产物
  的模块 id 与源码路径不一致）——与设计文档 D4 结论一致
- HTTP 轮询（150ms）替代 WS：原型验证协议正确性，延迟/吞吐未优化
- `canReuse` 未实现：collect 与 run 各启动一次 Zotero（当前 vitest 4 的 run 模式
  单次 startTests 内完成 collect+run，无实际影响）
