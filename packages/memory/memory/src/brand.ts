import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one stored memory record. */
export type MemoryId = Branded<'MemoryId'>

/**
 * Brand an implementation-minted memory identity.
 * @param id - opaque memory identity.
 * @returns the same string, branded; no validation is performed.
 */
export function MemoryId(id: string): MemoryId {
  return id as MemoryId
}
