import type { ExtensionDynamicModuleContext } from '../../../src/extension'

import { errorMessageFrom } from '@moeru/std'

import { defineExtension } from '../../../src/extension'
import { createKitHandle } from '../../../src/kit'
import { shellControlKit } from '../kits'

const events: string[] = []

/** The scripts that an agent can send. Each one gets the Kits of its upsert. */
const scripts: Record<string, (module: ExtensionDynamicModuleContext, kits: string[]) => void | Promise<void>> = {
  notes: async (module, kits) => {
    const revision = events.filter(event => event.startsWith(`start ${module.id}`)).length + 1
    const label = `${module.id}#${revision}`
    events.push(`start ${label} kits=${kits.join(',')}`)
    for (const id of kits) {
      const client = module.kits.get(createKitHandle<Record<string, unknown>>(id, '1.0.0'))
      events.push(`  ${label} has ${id}: ${client !== undefined}`)
    }
    module.effect(() => () => {
      events.push(`stop ${label}`)
    })
  },
}

/** S4: a shell that runs scripts with Kit lists that come at run time. */
export default defineExtension({
  id: 'plugin-shell',
  setup(ctx) {
    ctx.kits.provide(shellControlKit, {
      methods: {
        run: async ({ id, script, kits, timeoutMs }) => {
          const run = scripts[script]
          if (!run)
            return { ok: false, error: `unknown script ${script}` }
          try {
            await ctx.modules.upsert(id, {
              kits: kits.map(kit => createKitHandle(kit, '1.0.0')),
              setup: module => run(module, kits),
              timeoutMs,
            })
            return { ok: true }
          }
          catch (error) {
            const code = (error as { code?: unknown, reason?: unknown }).code ?? (error as { reason?: unknown }).reason
            return { ok: false, error: errorMessageFrom(error) ?? 'unknown error', code: typeof code === 'string' ? code : undefined }
          }
        },
        log: () => ({ events: [...events] }),
      },
    })
  },
})
