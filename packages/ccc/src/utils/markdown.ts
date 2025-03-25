export const content = (...contents: string[]) => contents.join('\n\n')

export const h = (length: 1 | 2 | 3 | 4 | 5 | 6, str: string) => `${'#'.repeat(length)} ${str}`

export const p = (arr: string[], separator = ' ') => arr.join(separator)

export const link = (content: string, href: string) => `[${content}](${href})`
