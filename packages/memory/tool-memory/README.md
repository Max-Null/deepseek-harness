# @deepseek-ai/dsh-tool-memory

English | [中文](README.zh.md)

Model-facing consumer of the [`dsh-memory`](../memory/README.md) seam: four tools (`memory_save`, `memory_list`, `memory_search`, `memory_forget`), a stable guidance section, and a dynamic recall context over confirmed (`auto`) memories. The model never self-promotes a memory — `memory_save` records `suggested`, and only a human confirmation promotes it.

## Tools

| Tool | Behavior |
|---|---|
| `memory_save` | Record one memory as `suggested`; never effective until confirmed. |
| `memory_list` | List every memory, filterable by namespace and status. |
| `memory_search` | Recall by keyword; deterministic literal matching. |
| `memory_forget` | Delete one memory by id. |

## Injection

- A stable `tool:memory` section carries fixed guidance (prefix-stable).
- A `memory:recall` context snapshots confirmed `auto` memories, each marked `[memory:<id>]`, so recall is source-traced and append-only.

## Model Experience

### Guidance section

#### What the model sees

A fixed guidance paragraph naming the four tools and the rule that a saved memory is a suggestion until a human confirms it.

#### Token effect

Fixed per-request cost.

#### KV Cache effect

Prefix-stable while the guidance text is unchanged.

### Recall context

#### What the model sees

Confirmed `auto` memories, one line each, prefixed with their `[memory:<id>]` source marker. Empty when no `auto` memory exists.

#### Token effect

Grows with the number and size of `auto` memories; zero when none.

#### KV Cache effect

Append-only: newly confirmed memories follow the reusable request prefix.

## Known Limitations and Deferred Work

- **Recall is status-driven, not query-driven** — confirmed `auto` memories are always present; `suggested` and `suggest` memories are only reachable through `memory_search`. Query-triggered automatic recall is deferred.
- **No self-audit tool** — the model's staleness/error self-audit is the planned v2 Consumer work.
