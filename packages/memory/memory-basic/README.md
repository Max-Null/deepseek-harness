# @deepseek-ai/dsh-memory-basic

English | [中文](README.zh.md)

Basic provider for the [`dsh-memory`](../memory/README.md) Service Definition: durable plaintext memory records in `ctx.storage.domain` with BM25 keyword retrieval. It implements the governing principles — a record is always created `suggested`, promoted only through the human gate, and retrieved by a pure keyword function with no model call.

## Service

`BasicMemoryEngine` extends `MemoryEngine` and loads as `ctx.memory`. It requires `ctx.storageDomain` to be mounted with a storage backend (`json` or `sqlite`) registered behind it.

| Member | Behavior |
|---|---|
| `remember(input)` | Creates a `suggested` record; id is a random UUID; `keywords` are lowercased. |
| `list(filter?)` | Reads records synchronously; filters by namespace/status. |
| `search(query, filter?)` | BM25 over `content` plus `keywords`, ordered by descending score. |
| `forget(id)` | Deletes durably; `true` when the record existed. |
| `setStatus(id, status)` | Promotes/demotes durably; throws on an unknown id. |

Each durable write emits `memory/changed` after the backend acknowledges it.

## Retrieval

BM25 tokenizes English/number runs whole and each CJK ideograph as its own term, so mixed Chinese-English content stays searchable. Recall is deterministic and keyless-replayable; a miss is explainable as "no keyword match".

## Model Experience

### Stored memory records

#### What the model sees

Nothing directly. This provider persists and retrieves records behind `ctx.memory`; the Consumer (`dsh-tool-memory`) renders them into the model request.

#### Token effect

Zero direct tokens on every request.

#### KV Cache effect

Independent of live requests: this provider never touches a request prefix, so it cannot invalidate provider cache reuse.

## Known Limitations and Deferred Work

- **Keyword retrieval, not semantics** — BM25 matches literal terms; it does not recall a memory that shares no term with the query. Semantic (vector) retrieval is a deferred v2 option, gated on observability and repair, per the [Agent Note](../../../.agents/notes/proposed/feature/2026-08-14-native-cross-session-memory.md).
- **No self-audit or learning here** — the model's staleness/error self-audit is the planned v2 Consumer work, not part of this provider.
