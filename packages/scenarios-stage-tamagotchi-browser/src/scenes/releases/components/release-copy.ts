/** One run of a title. An accented run uses the primary color. */
export interface TitleRun {
  text: string
  accent?: boolean
}

/** A list item. The `strong` part comes first and is bold. */
export interface CopyPoint {
  strong?: string
  text: string
}

/** The text of one release area. The area reads it in this order: eyebrow, title, lead, points, chips. */
export interface AreaCopy {
  eyebrow: string
  title: TitleRun[]
  lead?: string
  points?: CopyPoint[]
  chips?: string[]
}
