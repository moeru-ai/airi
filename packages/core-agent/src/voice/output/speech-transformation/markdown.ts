/** Code that markdown keeps as written: fenced blocks and inline code. Math delimiters inside it are not math. */
export const codeSpans = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/


/**
 * Converts `\(...\)` to `$...$` and `\[...\]` to `$$...$$`, outside code.
 * CommonMark reads `\(` as an escaped parenthesis, so the backslash is gone after parsing.
 */
export function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .split(codeSpans)
    .map((part, index) => index % 2 === 1
      ? part
      : part
          .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => `$$${tex}$$`)
          .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => `$${tex}$`))
    .join('')
}
