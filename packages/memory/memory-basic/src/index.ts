/**
 * Basic memory provider: durable plaintext records in `ctx.storage.domain`
 * with BM25 retrieval. It implements the [`dsh-memory`](../memory/README.md)
 * Service Definition. A record is always created `suggested` and becomes
 * effective only through `setStatus` — the human confirmation gate.
 * @module @deepseek-ai/dsh-memory-basic
 */

import { randomUUID } from 'node:crypto'
import { Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import MemoryEngine, { MemoryId } from '@deepseek-ai/dsh-memory'
import type {
  MemoryFilter,
  MemoryHit,
  MemoryNamespace,
  MemoryRecord,
  MemoryStatus,
  MemoryWrite,
} from '@deepseek-ai/dsh-memory'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { bm25Scores } from './bm25.ts'

export { bm25Scores, tokenize } from './bm25.ts'

/** A memory record as stored, without its id — the domain key is the id. */
interface StoredBlock {
  namespace: MemoryNamespace
  status: MemoryStatus
  content: string
  keywords: string[]
  createdAt: number
  updatedAt: number
}

const blockSchema = z.object({
  namespace: z.enum(['global', 'project']),
  status: z.enum(['suggested', 'auto', 'suggest']),
  content: z.string(),
  keywords: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
})

const memorySpec = defineDomain({
  name: 'memory',
  version: 1,
  tables: {
    blocks: domainTable<string, StoredBlock>(blockSchema),
  },
})

/** Attach the domain key as the record id. */
function toRecord(id: string, block: StoredBlock): MemoryRecord {
  return { id: MemoryId(id), ...block }
}

/**
 * Basic cross-session memory engine over the storage hub's domain form. Load
 * one per context as `ctx.memory`, with `storageDomain` mounted and a storage
 * backend (json or sqlite) registered behind it.
 */
export class BasicMemoryEngine extends MemoryEngine {
  static inject = ['storageDomain']

  private table?: KvTable<string, StoredBlock>

  /** Open the memory domain and own its lifecycle. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(memorySpec)
    this.ctx.effect(() => () => domain.close(), 'memory.domainClose')
    this.table = domain.table('blocks')
  }

  async remember(input: MemoryWrite): Promise<MemoryRecord> {
    const table = this.requireTable()
    const id = randomUUID()
    const now = Date.now()
    const block: StoredBlock = {
      namespace: input.namespace ?? 'global',
      status: 'suggested',
      content: input.content,
      keywords: (input.keywords ?? []).map(keyword => keyword.toLowerCase()),
      createdAt: now,
      updatedAt: now,
    }
    await table.put(id, block)
    const record = toRecord(id, block)
    this.ctx.emit('memory/changed', { operation: 'remembered', record })
    return record
  }

  list(filter?: MemoryFilter): MemoryRecord[] {
    const records = [...this.requireTable().entries()].map(([id, block]) => toRecord(id, block))
    return records.filter(record =>
      (filter?.namespace === undefined || record.namespace === filter.namespace)
      && (filter?.status === undefined || record.status === filter.status))
  }

  search(query: string, filter?: MemoryFilter): MemoryHit[] {
    const records = this.list(filter)
    const docs = records.map(record => `${record.content} ${record.keywords.join(' ')}`)
    const scores = bm25Scores(query, docs)
    return records
      .map((record, index) => ({ record, score: scores[index] as number }))
      .filter(hit => hit.score > 0)
      .sort((left, right) => right.score - left.score)
  }

  async forget(id: MemoryId): Promise<boolean> {
    const existed = await this.requireTable().delete(id)
    if (existed) this.ctx.emit('memory/changed', { operation: 'forgotten', id })
    return existed
  }

  async setStatus(id: MemoryId, status: MemoryStatus): Promise<MemoryRecord> {
    const table = this.requireTable()
    const block = table.get(id)
    if (block === undefined) {
      throw new Error(`cannot set status of unknown memory '${id}'`)
    }
    const updated: StoredBlock = { ...block, status, updatedAt: Date.now() }
    await table.put(id, updated)
    const record = toRecord(id, updated)
    this.ctx.emit('memory/changed', { operation: 'status', id, status })
    return record
  }

  private requireTable(): KvTable<string, StoredBlock> {
    if (this.table === undefined) throw new Error('memory engine is not started yet')
    return this.table
  }
}

export default BasicMemoryEngine
