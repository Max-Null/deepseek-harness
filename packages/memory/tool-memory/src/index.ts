/**
 * Model-facing memory tools and injection over the [`dsh-memory`](../memory/README.md)
 * seam: `memory_save`, `memory_list`, `memory_search`, and `memory_forget`,
 * plus a stable guidance section and a dynamic recall context over confirmed
 * (`auto`) memories. The model never self-promotes a memory — `memory_save`
 * records `suggested`, and only a human confirmation promotes it.
 * @module @deepseek-ai/dsh-tool-memory
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { MemoryHit, MemoryRecord } from '@deepseek-ai/dsh-memory'

export const name = 'tool-memory'
export const inject = ['memory', 'tools', 'systemPrompt']

/** Compact model-facing record; the branded id serializes as its string. */
interface MemoryToolRecord {
  id: string
  namespace: 'global' | 'project'
  status: 'suggested' | 'auto' | 'suggest'
  content: string
  keywords: string[]
  createdAt: number
  updatedAt: number
}

/** Compact model-facing search hit. */
interface MemoryToolHit {
  record: MemoryToolRecord
  score: number
}

const RECORD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    namespace: { type: 'string', required: true, enum: ['global', 'project'] },
    status: { type: 'string', required: true, enum: ['suggested', 'auto', 'suggest'] },
    content: { type: 'string', required: true },
    keywords: { type: 'array', required: true, items: { type: 'string' } },
    createdAt: { type: 'number', required: true },
    updatedAt: { type: 'number', required: true },
  },
} as const

const HIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    record: { ...RECORD_SCHEMA, required: true },
    score: { type: 'number', required: true },
  },
} as const

function recordValue(record: MemoryRecord): MemoryToolRecord {
  return {
    id: String(record.id),
    namespace: record.namespace,
    status: record.status,
    content: record.content,
    keywords: record.keywords,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function hitValue(hit: MemoryHit): MemoryToolHit {
  return { record: recordValue(hit.record), score: hit.score }
}

const GUIDANCE =
  'Use memory tools for cross-session preferences, habits, and project conventions. '
  + 'memory_save always records a suggestion (`suggested`) and never makes it effective itself — '
  + 'a human confirms it. When earlier context may be relevant, call memory_search to recall it. '
  + 'Every memory is plaintext and inspectable with memory_list; memory_forget removes one.'

/** Recall confirmed (`auto`) memories as an append-only runtime snapshot. */
function recallText(ctx: Context): string {
  const auto = ctx.memory.list({ status: 'auto' })
  if (auto.length === 0) return ''
  const lines = auto.map(record => `- [memory:${String(record.id)}] ${record.content}`)
  return `Remembered preferences and conventions — apply these:\n${lines.join('\n')}`
}

/** JSON-stringify a model result. */
function renderJson(value: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

function present(title: string, kind: 'read' | 'other', rawInput?: unknown): GenericCallView {
  return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } }
}

/** Register the four memory tools, the guidance section, and the recall context. */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'tool:memory',
    order: 115,
    text: GUIDANCE,
  })

  ctx.systemPrompt.context({
    name: 'memory:recall',
    order: 50,
    text: () => recallText(ctx),
  })

  ctx.tools.register(defineTool({
    name: 'memory_save',
    description: 'Record one cross-session memory as a suggestion. It never becomes effective until a human confirms it; the model must not present a suggestion as confirmed.',
    parameters: {
      content: { type: 'string', required: true, description: 'Plaintext memory content.' },
      namespace: {
        type: 'string',
        enum: ['global', 'project'],
        description: 'Where it applies; defaults to global.',
      },
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Explicit searchable anchors for memory_search.',
      },
    },
    output: {
      schema: RECORD_SCHEMA,
      render: (_args, value: MemoryToolRecord) => renderJson(value),
    },
    execute(args, _exec) {
      return ctx.memory.remember({
        content: args.content,
        ...args.namespace === undefined ? {} : { namespace: args.namespace },
        ...args.keywords === undefined ? {} : { keywords: args.keywords },
      }).then(recordValue)
    },
    presentCall: args => present('Save memory', 'other', args.content),
  }))

  ctx.tools.register(defineTool({
    name: 'memory_list',
    description: 'List every stored memory, optionally filtered by namespace or status. Every memory is plaintext and inspectable.',
    parameters: {
      namespace: { type: 'string', enum: ['global', 'project'], description: 'Restrict to one namespace.' },
      status: { type: 'string', enum: ['suggested', 'auto', 'suggest'], description: 'Restrict to one status.' },
    },
    output: {
      schema: { type: 'array', items: RECORD_SCHEMA },
      render: (_args, value: MemoryToolRecord[]) => renderJson(value),
    },
    execute(args, _exec) {
      return Promise.resolve(ctx.memory.list({
        ...args.namespace === undefined ? {} : { namespace: args.namespace },
        ...args.status === undefined ? {} : { status: args.status },
      }).map(recordValue))
    },
    presentCall: () => present('List memories', 'read'),
  }))

  ctx.tools.register(defineTool({
    name: 'memory_search',
    description: 'Recall stored memories by keyword. Deterministic literal matching — a miss means no stored term matched the query.',
    parameters: {
      query: { type: 'string', required: true, description: 'Keyword query.' },
      namespace: { type: 'string', enum: ['global', 'project'], description: 'Restrict to one namespace.' },
      status: { type: 'string', enum: ['suggested', 'auto', 'suggest'], description: 'Restrict to one status.' },
    },
    output: {
      schema: { type: 'array', items: HIT_SCHEMA },
      render: (_args, value: MemoryToolHit[]) => renderJson(value),
    },
    execute(args, _exec) {
      return Promise.resolve(ctx.memory.search(args.query, {
        ...args.namespace === undefined ? {} : { namespace: args.namespace },
        ...args.status === undefined ? {} : { status: args.status },
      }).map(hitValue))
    },
    presentCall: args => present('Search memory', 'read', args.query),
  }))

  ctx.tools.register(defineTool({
    name: 'memory_forget',
    description: 'Delete one stored memory by id. The human owner may remove any memory.',
    parameters: {
      id: { type: 'string', required: true, description: 'Exact memory id from memory_list or memory_search.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { deleted: { type: 'boolean' } } },
      render: (_args, value: { deleted: boolean }) => renderJson(value),
    },
    execute(args, _exec) {
      return ctx.memory.forget(args.id as never).then(deleted => ({ deleted }))
    },
    presentCall: args => present('Forget memory', 'other', args.id),
  }))
}
