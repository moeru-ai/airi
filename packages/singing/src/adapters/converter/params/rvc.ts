/**
 * Default RVC inference parameters.
 * Field names aligned with RVC CLI/API conventions.
 */
export interface RvcParams {
  f0UpKey: number
  f0Method: string
  indexRate: number
  filterRadius: number
  protect: number
  rmsMixRate: number
  f0File?: string
  indexFile?: string
}

export const DEFAULT_RVC_PARAMS: RvcParams = {
  f0UpKey: 0,
  f0Method: 'rmvpe',
  indexRate: 0.75,
  filterRadius: 3,
  protect: 0.20,
  rmsMixRate: 0.25,
}
