/**
 * The fields of a tool result that a widget accounts for.
 *
 * - `true` covers a field with everything under it.
 * - An object covers only the fields that it names.
 * - A one-item array covers every item of a list with its item.
 * - A longer array covers each item with the entry at its index, so a widget can leave out an item that it cannot show.
 *   A list of one item reads the same either way.
 */
export type ToolResultCoverage = true | { [field: string]: ToolResultCoverage } | ToolResultCoverage[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// A display rule of the panel: a field without a value says nothing, so it does not show as other data.
function isEmpty(value: unknown) {
  return value === undefined || value === null || value === ''
    || (Array.isArray(value) && value.length === 0)
    || (isRecord(value) && Object.keys(value).length === 0)
}

function collectRest(value: unknown, coverages: ToolResultCoverage[]): unknown {
  if (coverages.length === 0)
    return isEmpty(value) ? undefined : value
  if (coverages.includes(true))
    return undefined

  if (Array.isArray(value)) {
    const itemCoverages = (index: number) => coverages.flatMap((coverage) => {
      if (!Array.isArray(coverage))
        return []
      const entry = coverage.length === 1 ? coverage[0] : coverage[index]
      return entry === undefined ? [] : [entry]
    })
    const items = value.map((item, index) => collectRest(item, itemCoverages(index)))
    // An item without rest stays as an empty object, so every other item keeps its number.
    return items.some(item => item !== undefined) ? items.map(item => item ?? {}) : undefined
  }

  if (isRecord(value)) {
    const rest: Record<string, unknown> = {}
    for (const [field, fieldValue] of Object.entries(value)) {
      const fieldCoverages = coverages.flatMap(coverage => isRecord(coverage) && coverage[field] !== undefined ? [coverage[field]] : [])
      const fieldRest = collectRest(fieldValue, fieldCoverages)
      if (fieldRest !== undefined)
        rest[field] = fieldRest
    }
    return Object.keys(rest).length > 0 ? rest : undefined
  }

  return isEmpty(value) ? undefined : value
}

/**
 * Collects the fields of a tool result that a widget neither shows nor leaves out on purpose.
 *
 * The panel shows them under the widget as other data, so a widget never hides part of a result.
 * Name the fields that the widget shows in `shown`. Name the fields that it leaves out on purpose, such as a field that repeats
 * another one, in `omitted`, with the reason next to each.
 *
 * @example
 * restOf({ city: 'Bangkok', timezone: 'Asia/Bangkok', id: 7 }, { city: true }, { id: true })
 * // => { timezone: 'Asia/Bangkok' }
 */
export function restOf(value: unknown, shown: ToolResultCoverage, omitted?: ToolResultCoverage): unknown {
  return collectRest(value, omitted ? [shown, omitted] : [shown])
}
