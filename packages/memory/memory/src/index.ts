/**
 * Memory Service Definition (`ctx.memory`): the abstract contract for a
 * cross-session, deterministic, human-owned memory store. Providers persist
 * records (the reference implementation uses `ctx.storage.domain` plus BM25);
 * consumers expose them to the model. The governing principles and the
 * capability split are recorded in the
 * [native cross-session memory Agent Note](../../../../.agents/notes/proposed/feature/2026-08-14-native-cross-session-memory.md).
 * @module @deepseek-ai/dsh-memory
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { MemoryId } from './brand.ts'
import type { MemoryFilter, MemoryHit, MemoryRecord, MemoryStatus, MemoryWrite } from './types.ts'

export { MemoryId } from './brand.ts'
export type {
  MemoryFilter,
  MemoryHit,
  MemoryNamespace,
  MemoryRecord,
  MemoryStatus,
  MemoryWrite,
} from './types.ts'

/** One durable memory change, emitted after the backend acknowledges the write. */
export type MemoryChange =
  | { operation: 'remembered'; record: MemoryRecord }
  | { operation: 'forgotten'; id: MemoryId }
  | { operation: 'status'; id: MemoryId; status: MemoryStatus }

declare module '@deepseek-ai/cordis' {
  interface Context {
    memory: MemoryEngine
  }

  interface Events {
    /**
     * A memory record was created, deleted, or promoted/demoted. Emitted once
     * per durable write, in write order, after durability resolves.
     * @param change - the operation discriminant and its record or identity.
     * @mode emit
     */
    'memory/changed'(change: MemoryChange): void
  }
}

/**
 * Abstract cross-session memory service. Implementations own persistence and
 * retrieval; the reference provider stores records in `ctx.storage.domain`
 * and retrieves them with BM25. Reads are synchronous over authoritative
 * in-memory state; writes await durability. A record is always created in
 * `suggested` status and becomes effective only through
 * {@link MemoryEngine.setStatus} — the human confirmation gate. Load one
 * implementation per context as `ctx.memory`.
 */
export abstract class MemoryEngine extends Service {
  constructor(ctx: Context) {
    super(ctx, 'memory')
  }

  /**
   * Create one memory record in `suggested` status. The caller (a model tool)
   * never self-promotes a memory; promotion is the separate
   * {@link MemoryEngine.setStatus} gate.
   * @param input - plaintext content and optional namespace and keywords.
   * @returns the created record.
   */
  abstract remember(input: MemoryWrite): Promise<MemoryRecord>

  /**
   * List stored records, optionally filtered. Reads authoritative in-memory
   * state synchronously; a plaintext record is always inspectable.
   * @param filter - optional namespace/status restriction.
   * @returns the matching records in an implementation-stable order.
   */
  abstract list(filter?: MemoryFilter): MemoryRecord[]

  /**
   * Retrieve records by keyword relevance. This is a pure function of the
   * store — no model call — so recall is deterministic and keyless-replayable.
   * @param query - the keyword query.
   * @param filter - optional namespace/status restriction.
   * @returns hits ordered by descending score; an empty array on no match.
   */
  abstract search(query: string, filter?: MemoryFilter): MemoryHit[]

  /**
   * Delete one record durably.
   * @param id - the record identity.
   * @returns `true` when the record existed, `false` when it was already absent.
   */
  abstract forget(id: MemoryId): Promise<boolean>

  /**
   * Promote or demote a record — the human confirmation gate. The model path
   * never calls this to self-promote; a human or a v2 self-audit does.
   * @param id - the record identity.
   * @param status - the target status.
   * @returns the updated record.
   * @throws when the record does not exist.
   */
  abstract setStatus(id: MemoryId, status: MemoryStatus): Promise<MemoryRecord>
}

export default MemoryEngine
