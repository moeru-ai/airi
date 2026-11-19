import type { TimelineItemRef } from '../headless'
import type { PlacedRow, RowModel, RowModelContext, TimelineRowEntry } from '../types'

/** What the row models of a frame depend on. A change of any field rebuilds all models. */
export interface RowModelInputs<Item extends TimelineItemRef, Row extends TimelineRowEntry> {
  rows: readonly PlacedRow<Row>[]
  model: (row: Row, context: RowModelContext) => RowModel<Item>
  /** The consumer raises it when the data of the rows changes in place. */
  version: number
  selection: string | undefined
  /** The time of the frame, or undefined for a trace without a live end. */
  now: number | undefined
}

/**
 * The row models by row key, rebuilt when the rows, the `model` function, the version, the selection, or the second
 * of now changes. A new `rows` array rebuilds too, so a replaced row or a new row key never draws a stale model.
 */
export class RowModelCache<Item extends TimelineItemRef, Row extends TimelineRowEntry> {
  private models = new Map<string, RowModel<Item>>()
  private last?: Omit<RowModelInputs<Item, Row>, 'now'> & { second: number }

  get(inputs: RowModelInputs<Item, Row>): Map<string, RowModel<Item>> {
    const second = inputs.now === undefined ? -1 : Math.floor(inputs.now / 1000)
    const last = this.last
    if (last && last.rows === inputs.rows && last.model === inputs.model && last.version === inputs.version && last.selection === inputs.selection && last.second === second)
      return this.models

    const models = new Map<string, RowModel<Item>>()
    for (const { row } of inputs.rows)
      models.set(row.key, inputs.model(row, { now: inputs.now }))
    this.models = models
    this.last = { rows: inputs.rows, model: inputs.model, version: inputs.version, selection: inputs.selection, second }
    return models
  }

  /** The models of the last `get`, for hit tests between frames. */
  current(): Map<string, RowModel<Item>> {
    return this.models
  }
}
