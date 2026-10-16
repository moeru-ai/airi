import type { ComputerUseCommandReader } from './view'

import { looseObject, record, safeParse, string } from 'valibot'

/** App activation and the permission check. */
export const appReaders: Record<string, ComputerUseCommandReader> = {
  'app.activate': (result) => {
    const parsed = safeParse(looseObject({ requested_bundle_id: string(), verification: looseObject({ observed_bundle_id: string(), status: string() }) }), result)
    if (!parsed.success)
      return undefined
    const { requested_bundle_id: requested, verification } = parsed.output
    return {
      view: { kind: 'activate', requested, observed: verification.observed_bundle_id, verification: verification.status },
      shown: { result: { requested_bundle_id: true, verification: { observed_bundle_id: true, status: true } } },
    }
  },
  'app.probePermissions': (result) => {
    const parsed = safeParse(record(string(), string()), result)
    if (!parsed.success)
      return undefined
    return {
      view: { kind: 'permissions', permissions: Object.entries(parsed.output).map(([name, status]) => ({ name, status })) },
      shown: { result: true },
    }
  },
}
