import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import MemoryEngine, { MemoryId } from '@deepseek-ai/dsh-memory'
import type { MemoryFilter, MemoryHit, MemoryRecord, MemoryStatus, MemoryWrite } from '@deepseek-ai/dsh-memory'

/**
 * A trivial concrete MemoryEngine implementing the abstract contract. The
 * Service Definition owns no persistence or retrieval — these tests exercise
 * its contract: service registration, the abstract method shape, and the
 * always-suggested creation rule.
 */
class StubMemoryEngine extends MemoryEngine {
  lastStatus: MemoryStatus | undefined

  override async remember(input: MemoryWrite): Promise<MemoryRecord> {
    return {
      id: MemoryId('m1'),
      namespace: input.namespace ?? 'global',
      status: 'suggested',
      content: input.content,
      keywords: input.keywords ?? [],
      createdAt: 0,
      updatedAt: 0,
    }
  }

  override list(_filter?: MemoryFilter): MemoryRecord[] {
    return []
  }

  override search(_query: string, _filter?: MemoryFilter): MemoryHit[] {
    return []
  }

  override async forget(_id: MemoryId): Promise<boolean> {
    return true
  }

  override async setStatus(id: MemoryId, status: MemoryStatus): Promise<MemoryRecord> {
    this.lastStatus = status
    return { id, namespace: 'global', status, content: '', keywords: [], createdAt: 0, updatedAt: 0 }
  }
}

describe('MemoryEngine', () => {
  it('registers an implementation as ctx.memory', async () => {
    const ctx = new Context()
    await ctx.plugin(StubMemoryEngine)
    expect(ctx.memory).toBeInstanceOf(StubMemoryEngine)
  })

  it('brands ids without changing the value', () => {
    expect(MemoryId('m1')).toBe('m1')
  })

  it('remember always creates suggested; setStatus is the promotion gate', async () => {
    const ctx = new Context()
    await ctx.plugin(StubMemoryEngine)

    const record = await ctx.memory.remember({ content: 'Vue3 用 <script setup>', keywords: ['vue'] })
    expect(record.status).toBe('suggested')
    expect(record.content).toBe('Vue3 用 <script setup>')
    expect(record.keywords).toEqual(['vue'])

    const promoted = await ctx.memory.setStatus(record.id, 'auto')
    expect(promoted.status).toBe('auto')
  })
})
