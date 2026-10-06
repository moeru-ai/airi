import type { AiriCard } from '../../types/airiCard'
import type { DocumentFields } from '../document-sync'

/**
 * The containers that are split into their members. All other values are one
 * part each, so the settings of one module always change together.
 */
const SPLIT_CONTAINERS = [
  [],
  ['extensions'],
  ['extensions', 'airi'],
  ['extensions', 'airi', 'modules'],
]

function isSplitContainer(path: string[]) {
  return SPLIT_CONTAINERS.some(container => container.length === path.length && container.every((segment, index) => segment === path[index]))
}

function toPointer(path: string[]) {
  return path.map(segment => `/${segment.replaceAll('~', '~0').replaceAll('/', '~1')}`).join('')
}

function fromPointer(key: string) {
  return key.slice(1).split('/').map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
}

/**
 * A key is valid when it names a member of a split container that is not
 * itself split. Keys come from other devices, so this is a trust boundary.
 */
function isFieldPath(path: string[]) {
  // `__proto__` as an assigned key replaces the prototype of the target object.
  return !path.includes('__proto__')
    && isSplitContainer(path.slice(0, -1))
    && !isSplitContainer(path)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Splits a card into the parts that devices synchronize separately. Each key
 * is an RFC 6901 JSON Pointer to the part.
 *
 * The first level of the card gives one part for each key. `extensions`,
 * `extensions.airi`, and `extensions.airi.modules` give one part for each of
 * their keys. Absent and `null` values give no part.
 *
 * @example
 * splitCard({ name: 'Luna', extensions: { airi: { modules: { speech: { provider: 'a' } }, agents: {} } } })
 * // => { '/name': 'Luna', '/extensions/airi/modules/speech': { provider: 'a' }, '/extensions/airi/agents': {} }
 */
export function splitCard(card: AiriCard): DocumentFields {
  const fields: DocumentFields = {}

  function collect(container: Record<string, unknown>, path: string[]) {
    for (const [name, value] of Object.entries(container)) {
      const memberPath = [...path, name]
      if (value === undefined || value === null)
        continue
      if (isSplitContainer(memberPath) && isRecord(value))
        collect(value, memberPath)
      else if (isFieldPath(memberPath))
        fields[toPointer(memberPath)] = value
    }
  }

  // The JSON round trip removes `undefined` members. The server stores JSON,
  // so a value with such a member never equals the value that comes back.
  collect(JSON.parse(JSON.stringify(card)), [])
  return fields
}

/**
 * Builds a card from its parts. The function ignores keys that {@link splitCard}
 * cannot produce.
 *
 * The result is not validated. The caller must normalize it before use.
 */
export function joinCard(fields: DocumentFields): Record<string, unknown> {
  const card: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    const path = fromPointer(key)
    if (!key.startsWith('/') || !isFieldPath(path))
      continue

    let container = card
    for (const segment of path.slice(0, -1)) {
      const next = container[segment]
      if (isRecord(next)) {
        container = next
      }
      else {
        const created: Record<string, unknown> = {}
        container[segment] = created
        container = created
      }
    }
    container[path.at(-1)!] = value
  }

  return card
}
