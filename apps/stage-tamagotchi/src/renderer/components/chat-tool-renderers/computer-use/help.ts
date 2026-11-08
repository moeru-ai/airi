/** One command or option of a help section, with its description. */
export interface AuvHelpItem {
  name: string
  description: string
}

/** One section of AUV help, such as `Commands:` or `Options:`. */
export interface AuvHelpSection {
  title: string
  /** The commands, arguments, or options that the section lists. */
  items: AuvHelpItem[]
  /** The other lines of the section, such as examples or a usage line, with their indent kept. */
  text: string
}

export interface AuvHelp {
  /** The paragraphs before the first section. */
  intro: string[]
  sections: AuvHelpSection[]
}

const SECTION_TITLE = /^([A-Z][A-Za-z ]*):(.*)$/

/** Reads an item on one indented line: its name, two or more spaces, and its description. */
function readOneLineItem(line: string): AuvHelpItem | undefined {
  const trimmed = line.trimStart()
  const gap = trimmed.search(/ {2,}/)
  if (trimmed.length === line.length || gap <= 0)
    return undefined
  const description = trimmed.slice(gap).trim()
  return description ? { name: trimmed.slice(0, gap), description } : undefined
}

function indentOf(line: string) {
  return line.length - line.trimStart().length
}

function readSection(title: string, lines: string[]): AuvHelpSection {
  const items: AuvHelpItem[] = []
  const text: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const oneLine = readOneLineItem(line)
    if (oneLine) {
      items.push(oneLine)
      continue
    }
    // An item can also put its name on one line and indent its description on the lines below.
    const next = lines[index + 1]
    if (line.trim() && indentOf(line) > 0 && next?.trim() && indentOf(next) > indentOf(line)) {
      const description: string[] = []
      while (index + 1 < lines.length && (!lines[index + 1]!.trim() || indentOf(lines[index + 1]!) > indentOf(line)))
        description.push(lines[++index]!.trim())
      items.push({ name: line.trim(), description: description.join('\n').trim() })
      continue
    }
    text.push(line)
  }
  return { title, items, text: text.join('\n').replace(/^\n+|\n+$/g, '') }
}

/**
 * Reads the help text that AUV prints for `invoke --help` and for `invoke <command> --help`.
 *
 * A line at the start of a line that ends with a colon, such as `Commands:`, starts a section. Returns `undefined` for text
 * without sections, so the card shows the text as it is.
 *
 * @example
 * parseAuvHelp('Invoke operations.\n\nCommands:\n  display.list  List displays.')
 * // => { intro: ['Invoke operations.'], sections: [{ title: 'Commands', items: [{ name: 'display.list', description: 'List displays.' }], text: '' }] }
 */
export function parseAuvHelp(text: string): AuvHelp | undefined {
  const intro: string[] = []
  const sections: Array<{ title: string, lines: string[] }> = []
  for (const line of text.split('\n')) {
    const title = SECTION_TITLE.exec(line)
    if (title) {
      const inline = title[2]!.trim()
      sections.push({ title: title[1]!, lines: inline ? [`  ${inline}`] : [] })
      continue
    }
    if (sections.length === 0)
      intro.push(line)
    else
      sections.at(-1)!.lines.push(line)
  }
  if (sections.length === 0)
    return undefined
  return {
    intro: intro.join('\n').split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean),
    sections: sections.map(section => readSection(section.title, section.lines)),
  }
}
