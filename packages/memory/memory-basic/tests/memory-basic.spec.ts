import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Storage from '@deepseek-ai/dsh-storage'
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import BasicMemoryEngine from '@deepseek-ai/dsh-memory-basic'
import { MemoryId } from '@deepseek-ai/dsh-memory'
import type { MemoryChange } from '@deepseek-ai/dsh-memory'

async function setup() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(await mkdtemp(join(tmpdir(), 'memory-basic-')))
  ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json' })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(BasicMemoryEngine)
  return { ctx }
}

describe('BasicMemoryEngine', () => {
  it('remember creates a suggested record and list reads it back', async () => {
    const { ctx } = await setup()
    const changes: MemoryChange[] = []
    ctx.on('memory/changed', (change) => { changes.push(change) })

    const record = await ctx.memory.remember({ content: 'Vue3 用 <script setup>', keywords: ['vue', 'vue3'] })
    expect(record.status).toBe('suggested')
    expect(record.namespace).toBe('global')
    expect(record.keywords).toEqual(['vue', 'vue3'])

    expect(ctx.memory.list()).toEqual([record])
    expect(changes).toEqual([{ operation: 'remembered', record }])
  })

  it('search ranks keyword matches and respects the filter', async () => {
    const { ctx } = await setup()
    await ctx.memory.remember({ content: 'Vue3 script setup', keywords: ['vue', 'vue3'], namespace: 'project' })
    await ctx.memory.remember({ content: 'PPT 压缩太大', keywords: ['ppt'] })

    const hits = ctx.memory.search('vue')
    expect(hits.map(hit => hit.record.content)).toEqual(['Vue3 script setup'])

    expect(ctx.memory.search('vue', { namespace: 'global' })).toEqual([])
  })

  it('setStatus promotes through the gate, forget deletes, and unknown ids fail', async () => {
    const { ctx } = await setup()
    const record = await ctx.memory.remember({ content: '中文编码规范优先' })

    const promoted = await ctx.memory.setStatus(record.id, 'auto')
    expect(promoted.status).toBe('auto')
    expect(ctx.memory.list()[0]?.status).toBe('auto')

    await expect(ctx.memory.setStatus(MemoryId('unknown'), 'auto')).rejects.toThrow(/unknown memory/)

    expect(await ctx.memory.forget(record.id)).toBe(true)
    expect(await ctx.memory.forget(record.id)).toBe(false)
    expect(ctx.memory.list()).toEqual([])
  })
})
