import type { TextContentPart } from '@xsai/shared-chat'

export function div(...args: (null | string | TextContentPart | TextContentPart[] | undefined)[]) {
  const results: string[] = []

  for (const arg of args) {
    if (arg == null) {
      continue
    }
    if (typeof arg === 'string') {
      results.push(arg)
    }
    else if (Array.isArray(arg)) {
      results.push(div(...arg))
    }
    else {
      results.push(arg.text)
    }
  }

  return results.join('\n\n')
}

export function span(...args: string[]) {
  return args
    .map(arg => arg.trim())
    .map(arg => arg.replaceAll(/\n\s+/g, ''))
    .map(arg => arg.replaceAll(/\r\s+/g, ' '))
    .join(' ')
}

// ul + li
export function ul(...args: string[]) {
  return args.map((arg) => {
    return `- ${arg}`
  }).join('\n')
}

export function vChoice(...args: [(() => boolean) | boolean, string][]) {
  for (let i = 0; i < args.length; i++) {
    const exp = args[i][0]

    if (typeof exp === 'function' ? exp() : exp) {
      return args[i][1]
    }
  }

  return ''
}

export function vif(condition: boolean, a: string, b = '') {
  return condition ? a : b
}
