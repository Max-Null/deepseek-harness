# @deepseek-ai/dsh-memory

English | [中文](README.zh.md)

Abstract cross-session memory service (`ctx.memory`) for the DeepSeek Harness. It is the Service Definition role of the memory capability seam: it names the contract, vocabulary, and change event without owning persistence or retrieval. The reference provider is [`dsh-memory-basic`](../memory-basic/README.md); the model-facing consumer is [`dsh-tool-memory`](../tool-memory/README.md). The governing principles — human-owned, observable before precise, plaintext-auditable, deterministic — are recorded in the [native cross-session memory Agent Note](../../../.agents/notes/proposed/feature/2026-08-14-native-cross-session-memory.md).

## Service: `MemoryEngine` (ctx key: `memory`)

A record is always created in `suggested` status and becomes effective only through `setStatus` — the human confirmation gate. Reads are synchronous over authoritative in-memory state; writes await durability.

| Member | Semantics |
|---|---|
| `remember(input)` | Create one record in `suggested` status; the model path never self-promotes. |
| `list(filter?)` | List records synchronously, optionally filtered by namespace/status. |
| `search(query, filter?)` | BM25 keyword retrieval — a pure function of the store, no model call. |
| `forget(id)` | Delete one record durably; `true` when it existed. |
| `setStatus(id, status)` | Promote or demote a record — the human gate. |

### Key types

- `MemoryRecord` — `{ id, namespace, status, content, keywords, createdAt, updatedAt }`; `content` is plaintext by design.
- `MemoryNamespace` — `'global' | 'project'`.
- `MemoryStatus` — `'suggested' | 'auto' | 'suggest'`.
- `MemoryWrite` — the `remember` input; `status` is absent because creation is always `suggested`.
- `MemoryFilter` — namespace/status restriction for `list` and `search`.
- `MemoryHit` — `{ record, score }`, ordered by descending score.

### Live events

`memory/changed` is emitted once per durable write after durability resolves. Its payload is the `MemoryChange` union: `remembered`, `forgotten`, or `status`.

### Extension points

Implementations subclass `MemoryEngine` and own persistence and retrieval. The reference provider stores records in `ctx.storage.domain` and retrieves with BM25. The `./invariant` companion registers the package's empty installer — this abstract contract owns no event stream or mutable medium to cross-check.

## Model Experience

### Memory records

#### What the model sees

Nothing directly. This package is an abstract Service Definition; the Consumer (`dsh-tool-memory`) renders memories into the model request, and the Provider persists them. The seam itself injects no prompt and registers no tool.

#### Token effect

Zero direct tokens on every request.

#### KV Cache effect

Independent of live requests: the abstract contract never touches a request prefix, so it cannot invalidate provider cache reuse.

## Known Limitations and Deferred Work

- **No persistence or retrieval here** — the Service Definition is deliberately abstract; the reference provider `dsh-memory-basic` owns storage (via `ctx.storage.domain`) and BM25.
- **No self-audit or learning in v1** — the model's memory self-audit (staleness and error checks) is the planned v2 and depends on this package's plaintext records.
