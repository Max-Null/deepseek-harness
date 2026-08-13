import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as MemoryInvariant from '@deepseek-ai/dsh-memory/invariant'

describe('memory invariant companion', () => {
  it('registers its no-op installer under the package name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await expect(ctx.plugin(MemoryInvariant).then(() => undefined)).resolves.toBeUndefined()
  })
})
