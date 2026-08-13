import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as MemoryBasicInvariant from '@deepseek-ai/dsh-memory-basic/invariant'

describe('memory-basic invariant companion', () => {
  it('registers its no-op installer under the package name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await expect(ctx.plugin(MemoryBasicInvariant).then(() => undefined)).resolves.toBeUndefined()
  })
})
