# Custom Pool Prototype — vitest 直接驱动外部执行环境

验证"写一个 vitest custom pool 让 vitest 原生支持 Zotero"（而非在 scaffold 内封装 vitest）的可行性。

## 架构

```
vitest CLI (vitest 4.1.4)
└─ vitest server：原生 reporter / collect+run 生命周期 / 退出码
   └─ zotero-pool.ts（PoolRunnerInitializer，vitest/node 官方扩展点）
      ├─ start(): fork worker-page.js（模拟"启动 Zotero 页面"）
      ├─ 传输：child_process IPC（模拟未来的 HTTP/WS 通道）
      └─ worker-page.js：init() 官方 worker 运行时
         ├─ post/on/off → IPC（自定义 transport）
         └─ runTests/collectTests = runBaseTests（官方 TestRunner）
```

## 已验证（全部通过）

| 验证点 | 结果 |
|---|---|
| custom pool 扩展点（`PoolRunnerInitializer`/`PoolWorker`）驱动整个生命周期 | ✅ |
| `init()` 接受任意 transport（`post`/`on`/`off`），RPC 协议全走该通道 | ✅ |
| 官方 `runBaseTests` 在**无 vite 模块图**下运行（`experimental.viteModuleRunner: false` → NativeModuleRunner，node 原生 `import()`） | ✅ |
| 测试结果经自定义通道回传 → **vitest 原生 reporter 驱动**（无鸭子类型、无假 ctx） | ✅ |
| jest 风格断言（`toBe`/`toHaveBeenCalledWith`）、chai 风格（`to.deep.equal`）、`vi.fn`、`vi.useFakeTimers` | ✅ 4/4 |
| 失败测试 → 原生失败报告 + 退出码 1 | ✅ |
| collect 阶段（vitest 先 collect 再 run，各创建一次 pool worker） | ✅ |

## 已验证的边界（重要结论）

**`vi.mock` 在 native 模式（viteModuleRunner: false）不可用**（vitest 4.1.4）：

- 根因：`NativeModuleMocker` 构造时未注入 `rpc`/`interceptor` 字段（`src/.../base.ts` 的 `startModuleRunner` 只传了 `resolveId/root/...`），`queueMock()` 的注册链路（`this.rpc.resolveMock` → `this.interceptor.register`）断裂，mock 永不进入 registry（`resolveMockedModule` 恒返回 undefined），且静默失败
- 影响：Zotero 场景下 `vi.mock` 仍需后续阶段解决（vite transform 管线或 vitest 修复 native mocker）；不影响 pool 方案本身

## 对 Zotero 集成的意义

1. **页面侧**：`worker-page.js` 原样可移植——`init()` + `runBaseTests` 不需要 vite dev server、不需要 module transform，Zotero chrome:// 页面只需提供 transport（HTTP/WS 替代 IPC）+ 用 rolldown 打包产物替换原生 `import()`
2. **宿主侧**：`zotero-pool.ts` 的 `start()` 替换为"构建 tester 插件 → 启动 Zotero"，`send/on` 替换为 HTTP/WS 桥接——vitest 的 reporter/watch/过滤/退出码全部原生
3. 设计文档 D2/D3 的最大风险点（reporter 鸭子类型、假 ctx、协议复刻）**消失**——vitest server 自己构造 TestModule/TestCase

## 运行

```bash
npx vitest run   # 在该目录下；passing 4 过，failing 1 失败（预期），mock 1 失败（已知限制）
```
