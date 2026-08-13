/**
 * Memory vocabulary shared by the memory capability seam. The Service
 * Definition owns these types; the Provider persists records and the Consumer
 * renders them for the model. Records are plaintext by design — the human
 * owner and the model read the same text.
 * @module @deepseek-ai/dsh-memory/types
 */

import type { MemoryId } from './brand.ts'

export type { MemoryId }

/** Where a memory applies. `global` spans every project; `project` scopes to one workspace. */
export type MemoryNamespace = 'global' | 'project'

/**
 * Lifecycle status of one memory. `suggested` is model-written and not yet
 * effective; a human confirmation gate promotes it to `auto` (applied
 * automatically) or `suggest` (offered, not auto-applied).
 */
export type MemoryStatus = 'suggested' | 'auto' | 'suggest'

/** One stored memory record. Plain immutable data; replace through the engine, never mutate in place. */
export interface MemoryRecord {
  /** Stable opaque identity. */
  id: MemoryId
  /** Where the memory applies. */
  namespace: MemoryNamespace
  /** Lifecycle status. */
  status: MemoryStatus
  /** The plaintext memory content — readable by human and model alike. */
  content: string
  /** Keyword anchors for retrieval; lowercased by the provider. */
  keywords: string[]
  /** Unix epoch milliseconds the record was first written. */
  createdAt: number
  /** Unix epoch milliseconds the record was last written. */
  updatedAt: number
}

/** Input to {@link MemoryEngine.remember}. The created record always starts `suggested`. */
export interface MemoryWrite {
  /** Plaintext memory content. */
  content: string
  /** Where the memory applies; defaults to `global`. */
  namespace?: MemoryNamespace
  /** Explicit keyword anchors; the provider also derives keywords from `content`. */
  keywords?: string[]
}

/** Filter for {@link MemoryEngine.list} and {@link MemoryEngine.search}. */
export interface MemoryFilter {
  /** Restrict to one namespace. */
  namespace?: MemoryNamespace
  /** Restrict to one status. */
  status?: MemoryStatus
}

/** One retrieval hit: the matched record and its relevance score. */
export interface MemoryHit {
  /** The matched record. */
  record: MemoryRecord
  /** Non-negative relevance score; higher means a stronger match. */
  score: number
}
