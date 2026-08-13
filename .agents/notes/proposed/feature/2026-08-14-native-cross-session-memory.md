# Agent Note: Native cross-session memory — deterministic, observable, human-owned

Status: proposed

English | [中文](2026-08-14-native-cross-session-memory.zh.md)

## Problem

The harness has no first-party cross-session memory. A user who wants "remember that I prefer `<script setup>` in Vue, across all my sessions" has two paths today, and neither serves them:

- **Third-party memory via MCP** — the [third-party memory examples](../../implemented/feature/2026-07-31-third-party-memory-mcp-examples.md) ship Memorix, MCP Reference Memory, and Engram as default-off overlays. Each needs a pinned external binary, a supervised subprocess or HTTP service, provider-owned storage and embeddings, and provider-owned tool schemas. For one lightweight preference or project convention this is heavy machinery, and the memory itself lives in an opaque external store the user cannot inspect and the model cannot audit — a black box.
- **In-session recall and log references** — [recallable-compaction](2026-07-06-recallable-compaction.md) and [cross-session-references](../../implemented/feature/2026-07-21-cross-session-references.md) address episodic history: what happened in a session, lifted out of a session log. Neither is a durable store for semantic memory — preferences, habits, project conventions — that outlives any single session.

The result is a gap. Durable, first-party, inspectable memory does not exist. The closest shipped path turns memory into an external, unobservable black box, which fails the human who owns it and the model that should be able to check it.

## Proposal

Add a first-party cross-session memory capability as a three-package seam over the existing storage hub:

- `@deepseek-ai/dsh-memory` — Service Definition: the `ctx.memory` contract (remember / list / search / forget), the memory vocabulary, and the `memory/*` events.
- `@deepseek-ai/dsh-memory-basic` — Service Provider: durable records in `ctx.storage.domain`, BM25 keyword retrieval, and the status lifecycle (`suggested` → `auto` / `suggest`).
- `@deepseek-ai/dsh-tool-memory` — Consumer: the model tools `memory_save`, `memory_list`, `memory_search`, `memory_forget`, plus the stable-memory system-prompt section and the dynamic recall context.

### The governing principles

These four constraints outrank every implementation detail. A design that violates one is wrong no matter how well it performs.

1. **The human is the owner.** The model only ever writes a memory in `suggested` status; nothing becomes effective without passing a human confirmation gate. The model never silently promotes a memory.
2. **Observable before precise.** Every memory is plaintext, listable, and deletable. There is no hidden memory. A stale or wrong memory must be discoverable and repairable, never a silent reef that keeps being recalled because no one can see it.
3. **Plaintext is the audit window for human and model alike.** Because a memory is readable text, the model can self-audit it for staleness and error — the same work it does on documents and code — which is the planned v2.
4. **Deterministic and cache-safe in v1.** Stable memories enter the system prompt as a stable section (prefix-stable); dynamic recall enters as a runtime-context snapshot (append-only history). The recall path makes no LLM call, preserving keyless replay determinism.

### v1: deterministic, observable memory

v1 ships the store, the four tools, and the injection path with no LLM call in the hot path.

| Tool | Behavior |
|---|---|
| `memory_save` | Write one memory in `suggested` status; never self-promoting |
| `memory_list` | List every memory, filterable by namespace (global / project) and status |
| `memory_search` | BM25 keyword retrieval; each hit carries a source marker naming its memory key |
| `memory_forget` | Delete a memory, or demote its status |

Storage is a `memory` domain over `ctx.storage.domain` ([domain-kv-storage-and-workspace](../architecture/2026-07-24-domain-kv-storage-and-workspace.md)) with json/sqlite backends, so memories are plaintext records the user can read directly and the replay boundary can reconstruct. Retrieval is BM25 — a pure keyword function with no embedding dependency, predictable recall, and explainable misses. Injection follows the cache contract: stable memories in a system-prompt section, dynamic recall in a runtime-context snapshot that contributes nothing when nothing matches.

### v2: LLM self-audit and learning

Because v1 makes memories plaintext, v2 gives the model a standing job over them: audit stored memories for staleness and error against observed activity, propose updates, and learn new candidates from `session/event` — the `suggested → confirmed` habit flow. This is the only part that calls a model, and it rides `ctx.llm.stream()` off the request path. v2 is planned, not part of v1, and depends on v1's plaintext: there is nothing to audit while memory is an opaque vector.

### Relation to existing memory surfaces

- This note is the cross-session complement of [recallable-compaction](2026-07-06-recallable-compaction.md), whose scope is explicitly in-session history recall.
- It does not reverse [third-party-memory-mcp-examples](../../implemented/feature/2026-07-31-third-party-memory-mcp-examples.md): external memory servers remain the path for heavy semantic features (vector search, knowledge graphs) and vendor ecosystems. This note adds the lightweight, first-party, deterministic path the MCP route is too heavy and too opaque for.
- It is distinct from [cross-session-references](../../implemented/feature/2026-07-21-cross-session-references.md), which lifts material out of another session's log; memory is a durable knowledge store, not a transcript lift.

## Alternatives considered

**Use the shipped third-party MCP path for this.** Rejected: it demands external binaries, supervised subprocesses, provider-owned storage and embeddings, and turns memory into an opaque external state the user cannot inspect and the model cannot audit. For a lightweight preference or project convention it is heavy machinery and a black box — exactly the wishing machine this proposal refuses. The MCP route stays for heavy semantic features; it is not the right home for lightweight deterministic memory.

**Make v1 use vector (semantic) retrieval.** Rejected: a stale memory silently recalled because its vector stays semantically close is an unobservable reef — there is no plaintext to read, no way to notice it went stale, and no way to repair it. Semantic retrieval may be a v2 option, but only after observability and repair are solved; it is admitted on an observability condition, not a timeline.

**Build only the in-session recall path and defer cross-session.** Rejected: recall answers "what did we already talk about"; memory answers "what do I know about how you work". Both are needed, and they do not share a substrate — recall is a pure function of the session log, memory is a durable store over `ctx.storage.domain`.

**One plugin instead of a three-package seam.** Rejected: the capability's storage and retrieval (Provider) and its model surface (Consumer) evolve independently — v2 swaps or extends the provider (BM25 → semantics), and a `/memory` command could arrive as a second consumer without touching the definition. The split matches the compaction and bash seams.

## Acceptance criteria

- The seam ships as three packages with per-file 100% coverage, HMR disposal tests, and the `./invariant` companion for the memory domain.
- Every model-visible injection (stable section, recall context, tool results) is reconstructable from the durable store and carries a source marker naming the memory key.
- `memory_save` writes only `suggested` status; no code path promotes a memory without a confirmation gate; `memory_list` and `memory_forget` make any stored memory discoverable and removable.
- `memory_search` is a pure function of the store — no LLM call — so recall is deterministic and keyless-replayable; a miss is explainable as "no keyword match".
- A stale or wrong memory can be found by `memory_list`, its source traced through the injection marker, and repaired or removed by the human or by a v2 self-audit.
- The storage domain persists across fresh sessions (write in session A, read in session B) over both json and sqlite backends.

## Risks

- **Observability over precision is a deliberate trade.** BM25 recalls less than vector search would; the capability accepts that gap in v1 because predictable, repairable recall outranks silent, unrepairable recall.
- **The human gate adds friction.** Nothing is auto-effective, so a memory is only as useful as the user's confirmation habit; this is accepted as the price of ownership.
- **A first-party store is a new maintenance surface.** Unlike the MCP path, DSH now owns memory storage and retrieval; the scope is deliberately bounded (BM25, plaintext, no embeddings) to keep that surface small.
- **`storage.domain` visibility is in-process** ([domain-kv-storage-and-workspace](../architecture/2026-07-24-domain-kv-storage-and-workspace.md)); a second host process or a reconnecting GUI does not yet see live domain changes. The memory store inherits this limit until the cross-process revision pattern lands.
- **v2 is a promise, not v1.** Self-audit and learning are stated as plans; they are not shipped in v1 and their design is not finalized here.
