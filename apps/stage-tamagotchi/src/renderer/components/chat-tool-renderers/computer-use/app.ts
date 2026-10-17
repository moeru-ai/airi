import type { ComputerUseCommandReader } from './view'

import { looseObject, nullish, record, safeParse, string } from 'valibot'

// AUV prints the outcome of the check as `status` with the fields of that outcome, as its driver protocol defines them:
// an observed app when the app in front is known, or a reason when the check could not run.
const ActivateSchema = looseObject({
  requested_bundle_id: string(),
  verification: looseObject({ status: string(), observed_bundle_id: nullish(string()), reason: nullish(string()) }),
})

/** App activation and the permission check. */
export const appReaders: Record<string, ComputerUseCommandReader> = {
  'app.activate': (result) => {
    const parsed = safeParse(ActivateSchema, result)
    if (!parsed.success)
      return undefined
    const { requested_bundle_id: requested, verification } = parsed.output
    return {
      view: { kind: 'activate', requested, observed: verification.observed_bundle_id ?? undefined, reason: verification.reason ?? undefined, verification: verification.status },
      shown: { result: { requested_bundle_id: true, verification: { observed_bundle_id: true, reason: true, status: true } } },
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
