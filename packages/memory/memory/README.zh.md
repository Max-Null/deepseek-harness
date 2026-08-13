# @deepseek-ai/dsh-memory

[English](README.md) | 中文

DeepSeek Harness 的抽象跨会话记忆服务（`ctx.memory`）。它是记忆能力缝的服务定义角色：只命名契约、词汇表与变更事件，不拥有持久化或检索。参考提供者是 [`dsh-memory-basic`](../memory-basic/README.md)；面向模型的消费者是 [`dsh-tool-memory`](../tool-memory/README.md)。主导原则——人主导、可观测先于精准、明文可审计、确定性——记录在[原生跨会话记忆 Agent Note](../../../.agents/notes/proposed/feature/2026-08-14-native-cross-session-memory.md)。

## 服务：`MemoryEngine`（ctx 键：`memory`）

记录总是以 `suggested` 状态创建，只有通过 `setStatus` 才能生效——即人工确认闸门。读取在权威内存状态上同步进行；写入等待持久化。

| 成员 | 语义 |
|---|---|
| `remember(input)` | 以 `suggested` 状态创建一条记录；模型路径绝不自我提升。 |
| `list(filter?)` | 同步列出记录，可按命名空间/状态过滤。 |
| `search(query, filter?)` | BM25 关键词检索——存储的纯函数，无模型调用。 |
| `forget(id)` | 持久删除一条记录；存在时返回 `true`。 |
| `setStatus(id, status)` | 提升或降低一条记录——人工闸门。 |

### 关键类型

- `MemoryRecord` — `{ id, namespace, status, content, keywords, createdAt, updatedAt }`；`content` 设计上即明文。
- `MemoryNamespace` — `'global' | 'project'`。
- `MemoryStatus` — `'suggested' | 'auto' | 'suggest'`。
- `MemoryWrite` — `remember` 的输入；无 `status` 字段，因为创建永远是 `suggested`。
- `MemoryFilter` — `list` 与 `search` 的命名空间/状态限制。
- `MemoryHit` — `{ record, score }`，按分数降序。

### 实时事件

`memory/changed` 在每次持久写入解析后发出一次。其载荷是 `MemoryChange` 联合：`remembered`、`forgotten` 或 `status`。

### 扩展点

实现通过子类化 `MemoryEngine` 来拥有持久化与检索。参考提供者把记录存进 `ctx.storage.domain` 并用 BM25 检索。`./invariant` 配套注册本包的空安装器——这个抽象契约不拥有事件流或可变介质可供交叉校验。

## 模型体验

### 记忆记录

#### 模型看到什么

不直接看到任何内容。本包是抽象服务定义；消费者（`dsh-tool-memory`）把记忆渲染进模型请求，提供者负责持久化。能力缝本身不注入提示词、不注册工具。

#### Token 影响

每次请求零直接 token。

#### KV Cache 影响

与实时请求无关：抽象契约从不触碰请求前缀，因此不可能使提供者缓存复用失效。

## 已知限制与待办

- **此处无持久化或检索** — 服务定义刻意抽象；参考提供者 `dsh-memory-basic` 拥有存储（经 `ctx.storage.domain`）与 BM25。
- **v1 无自检或学习** — 模型的记忆自检（过期与纠错）是规划中的 v2，且依赖本包的明文记录。
