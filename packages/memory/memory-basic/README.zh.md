# @deepseek-ai/dsh-memory-basic

[English](README.md) | 中文

[`dsh-memory`](../memory/README.md) 服务定义的基础提供者：`ctx.storage.domain` 中的持久明文记忆记录 + BM25 关键词检索。它落实主导原则——记录总是以 `suggested` 创建、只能通过人工闸门提升、由无模型调用的纯关键词函数检索。

## 服务

`BasicMemoryEngine` 继承 `MemoryEngine`，以 `ctx.memory` 加载。它要求 `ctx.storageDomain` 已挂载，且其后注册了存储后端（`json` 或 `sqlite`）。

| 成员 | 行为 |
|---|---|
| `remember(input)` | 创建 `suggested` 记录；id 为随机 UUID；`keywords` 小写化。 |
| `list(filter?)` | 同步读取记录；按命名空间/状态过滤。 |
| `search(query, filter?)` | 对 `content` + `keywords` 做 BM25，按分数降序。 |
| `forget(id)` | 持久删除；记录存在时返回 `true`。 |
| `setStatus(id, status)` | 持久提升/降低；id 未知时抛错。 |

每次持久写入在后端确认后发出 `memory/changed`。

## 检索

BM25 把英文/数字串作为整体、每个汉字作为独立词元，因此中英混合内容仍可检索。召回确定且可无密钥回放；未命中可解释为「无关键词命中」。

## 模型体验

### 存储的记忆记录

#### 模型看到什么

不直接看到任何内容。此提供者在 `ctx.memory` 之后持久化与检索记录；消费者（`dsh-tool-memory`）把记录渲染进模型请求。

#### Token 影响

每次请求零直接 token。

#### KV Cache 影响

与实时请求无关：此提供者从不触碰请求前缀，因此不可能使提供者缓存复用失效。

## 已知限制与待办

- **关键词检索而非语义** — BM25 匹配字面词元；不会召回与查询无共同词元的记忆。语义（向量）检索是 deferred 的 v2 选项，以可观测性与可修复性为门槛，见 [Agent Note](../../../.agents/notes/proposed/feature/2026-08-14-native-cross-session-memory.md)。
- **此处无自检或学习** — 模型的过期/纠错自检是规划中的 v2 消费者工作，不属于此提供者。
