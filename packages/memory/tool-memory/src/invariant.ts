/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-memory`.
 * @module @deepseek-ai/dsh-tool-memory/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-memory'

/** Cordis companion plugin name. */
export const name = 'tool-memory-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this Consumer registers model-facing tools and prompt
 * sections over the `dsh-memory` seam. It owns no session event stream or
 * mutable medium to cross-check; the provider owns durability and the domain
 * layer owns schema validation.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
