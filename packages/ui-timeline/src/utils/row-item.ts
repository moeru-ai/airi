import type { TimelineItemRef } from '../headless'
import type { RowModel } from '../types'

/**
 * The item with a key in a row model: a point, an interval of a layer, or a state band. A row model rebuilds with new
 * item objects, so a hover card finds its item again by key.
 *
 * @example
 * rowItem(model, 'span-1')
 * // => the item of span-1 in the new model, or undefined when the row no longer has it
 */
export function rowItem<Item extends TimelineItemRef>(model: RowModel<Item> | undefined, key: string): Item | undefined {
  if (!model)
    return undefined
  const matches = (item: Item | undefined) => item?.key === key
  return model.pointTargets.find(matches)
    ?? model.layers.map(layer => layer.targets.find(matches)).find(item => item !== undefined)
    ?? model.states.targets.find(matches)
}
