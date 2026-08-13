import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'
import MemoryEngine, { MemoryId } from '@deepseek-ai/dsh-memory'
import type { MemoryFilter, MemoryHit, MemoryRecord, MemoryStatus, MemoryWrite } from '@deepseek-ai/dsh-memory'
import * as toolMemory from '@deepseek-ai/dsh-tool-memory'

const signal = new AbortController().signal

/** In-memory MemoryEngine for exercising the consumer without a storage backend. */
class StubMemoryEngine extends MemoryEngine {
  private readonly records = new Map<string, MemoryRecord>()

  override async remember(input: MemoryWrite): Promise<MemoryRecord> {
    const id = `m${this.records.size + 1}`
    const record: MemoryRecord = {
      id: MemoryId(id),
      namespace: input.namespace ?? 'global',
      status: 'suggested',
      content: input.content,
      keywords: input.keywords ?? [],
      createdAt: 0,
      updatedAt: 0,
    }
    this.records.set(id, record)
    return record
  }

  override list(filter?: MemoryFilter): MemoryRecord[] {
    return [...this.records.values()].filter(record =>
      (filter?.namespace === undefined || record.namespace === filter.namespace)
      && (filter?.status === undefined || record.status === filter.status))
  }

  override search(query: string, filter?: MemoryFilter): MemoryHit[] {
    return this.list(filter)
      .filter(record => record.content.toLowerCase().includes(query.toLowerCase())
        || record.keywords.some(keyword => keyword.toLowerCase().includes(query.toLowerCase())))
      .map(record => ({ record, score: 1 }))
  }

  override async forget(id: MemoryId): Promise<boolean> {
    return this.records.delete(String(id))
  }

  override async setStatus(id: MemoryId, status: MemoryStatus): Promise<MemoryRecord> {
    const record = this.records.get(String(id))
    if (record === undefined) throw new Error(`unknown memory '${id}'`)
    const updated = { ...record, status }
    this.records.set(String(id), updated)
    return updated
  }
}

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(StubMemoryEngine)
  const fiber = await ctx.plugin(toolMemory)
  return { ctx, fiber }
}

async function execute(ctx: Context, name: string, args: unknown): Promise<ToolExecutionResult> {
  return ctx.tools.execute({ signal, callId: CallId(`call-${Math.random()}`), name, arguments: args })
}

describe('tool-memory', () => {
  it('registers the four tools, the guidance section, and the recall context; disposes cleanly', async () => {
    const { ctx, fiber } = await harness()

    for (const name of ['memory_save', 'memory_list', 'memory_search', 'memory_forget']) {
      expect(ctx.tools.get(name)?.name).toBe(name)
    }
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.some(section => section.name === 'tool:memory')).toBe(true)
    expect(assembly.contexts.some(context => context.name === 'memory:recall')).toBe(true)

    await fiber.dispose()
    expect(ctx.tools.get('memory_save')).toBeUndefined()
    expect((await ctx.systemPrompt.assemble()).sections.some(section => section.name === 'tool:memory')).toBe(false)
  })

  it('recall context surfaces confirmed auto memories with source markers', async () => {
    const { ctx } = await harness()
    const saved = await ctx.memory.remember({ content: 'Vue3 用 script setup' })
    await ctx.memory.setStatus(saved.id, 'auto')

    const assembly = await ctx.systemPrompt.assemble()
    const recall = assembly.contexts.find(context => context.name === 'memory:recall')
    expect(recall?.text).toContain(`[memory:${String(saved.id)}]`)
    expect(recall?.text).toContain('Vue3 用 script setup')
  })

  it('saves, lists, searches, and forgets through the tools', async () => {
    const { ctx } = await harness()

    const saved = await execute(ctx, 'memory_save', { content: 'Vue3 script setup', keywords: ['vue', 'vue3'] })
    expect(saved.isError).toBe(false)
    expect(saved.value).toMatchObject({ content: 'Vue3 script setup', status: 'suggested' })

    const listed = await execute(ctx, 'memory_list', {})
    expect(listed.isError).toBe(false)
    expect(listed.value).toHaveLength(1)

    const searched = await execute(ctx, 'memory_search', { query: 'vue' })
    expect(searched.isError).toBe(false)
    expect(searched.value).toHaveLength(1)

    const id = (saved.value as { id: string }).id
    const forgotten = await execute(ctx, 'memory_forget', { id })
    expect(forgotten.value).toEqual({ deleted: true })

    const after = await execute(ctx, 'memory_list', {})
    expect(after.value).toHaveLength(0)
  })

  it('presents every tool with generic render intent', async () => {
    const { ctx } = await harness()

    expect(ctx.tools.get('memory_save')?.presentCall?.({ content: 'x' }))
      .toEqual({ card: 'generic', title: 'Save memory', kind: 'other', rawInput: 'x' })
    expect(ctx.tools.get('memory_list')?.presentCall?.({}))
      .toEqual({ card: 'generic', title: 'List memories', kind: 'read' })
    expect(ctx.tools.get('memory_search')?.presentCall?.({ query: 'vue' }))
      .toEqual({ card: 'generic', title: 'Search memory', kind: 'read', rawInput: 'vue' })
    expect(ctx.tools.get('memory_forget')?.presentCall?.({ id: 'm1' }))
      .toEqual({ card: 'generic', title: 'Forget memory', kind: 'other', rawInput: 'm1' })
  })

  it('executes save/list/search with the optional filters supplied and omitted', async () => {
    const { ctx } = await harness()

    const saved = await execute(ctx, 'memory_save', {
      content: 'vue project convention',
      namespace: 'project',
    })
    expect(saved.isError).toBe(false)

    const listed = await execute(ctx, 'memory_list', { namespace: 'project', status: 'suggested' })
    expect(listed.isError).toBe(false)
    expect(listed.value).toHaveLength(1)

    const searched = await execute(ctx, 'memory_search', { query: 'vue', namespace: 'project', status: 'suggested' })
    expect(searched.isError).toBe(false)
    expect(searched.value).toHaveLength(1)
  })
})
