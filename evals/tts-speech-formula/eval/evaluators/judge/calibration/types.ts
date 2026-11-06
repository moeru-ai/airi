/** A reading style, the same values as the judge answers. */
export type ReadingLabel = 'natural' | 'mixed' | 'spelled'

/** One reading that a person labels, to measure how often the judge agrees with a person. */
export interface CalibrationItem {
  /** `<object>|<case id>|<language>`. */
  id: string
  object: string
  caseId: string
  language: string
  /** The LaTeX source of the case. */
  reference: string
  /** The spoken text that the test object wrote. */
  spoken: string
  /** The median verdict of the judge when the item was collected, and the reason of its first vote. */
  judge: { reading: string, reason: string }
  /** The label of a person, or null before labeling. */
  label: ReadingLabel | null
  note: string
}

export interface CalibrationFile {
  seed?: number
  items: CalibrationItem[]
}
