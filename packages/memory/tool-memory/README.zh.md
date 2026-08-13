# @deepseek-ai/dsh-tool-memory

[English](README.md) | 中文

[`dsh-memory`](../memory/README.md) 能力缝的面向模型消费者：四个工具（`memory_save`、`memory_list`、`memory_search`、`memory_forget`）、一个稳定指引 section，以及一个对已确认（`auto`）记忆的动态召回 context。模型绝不自我提升记忆——`memory_save` 记录 `suggested`，只有人工确认才能提升。

## 工具

| 工具 | 行为 |
|---|---|
| `memory_save` | 以 `suggested` 记录一条记忆；确认前绝不生效。 |
| `memory_list` | 列出全部记忆，可按命名空间与状态过滤。 |
| `memory_search` | 按关键词召回；确定性字面匹配。 |
| `memory_forget` | 按 id 删除一条记忆。 |

## 注入

- 稳定的 `tool:memory` section 承载固定指引（前缀稳定）。
- `memory:recall` context 快照已确认的 `auto` 记忆，每条标记 `[memory:<id>]`，因此召回可溯源且 append-only。

## 模型体验

### 指引 section

#### 模型看到什么

一段固定指引，说明四个工具，以及「保存的记忆在人工确认前只是建议」这一规则。

#### Token 影响

每请求固定成本。

#### KV Cache 影响

指引文本不变时前缀稳定。

### 召回 context

#### 模型看到什么

已确认的 `auto` 记忆，每行一条，前缀带 `[memory:<id>]` 来源标记。无 `auto` 记忆时为空。

#### Token 影响

随 `auto` 记忆数量与大小增长；无则零。

#### KV Cache 影响

Append-only：新确认的记忆跟随可复用请求前缀。

## 已知限制与待办

- **召回按状态而非按查询** — 已确认的 `auto` 记忆始终在场；`suggested` 与 `suggest` 记忆只能经 `memory_search` 触达。查询触发的自动召回已推迟。
- **无自检工具** — 模型的过期/纠错自检是规划中的 v2 消费者工作。
