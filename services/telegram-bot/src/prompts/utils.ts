export function vif(condition: boolean, a: string, b = '') {
  return condition ? a : b
}

export function vChoice(...args: [boolean | (() => boolean), string][]) {
  let exp

  for (let i = 0; i < args.length; i++) {
    // eslint-disable-next-line no-cond-assign
    if (typeof (exp = args[i][0]) === 'function' ? exp() : exp) {
      return args[i][1]
    }
  }

  return ''
}

export function span(...args: string[]) {
  return args
    .map(arg => arg.trim())
    .map(arg => arg.replaceAll(/\n\s+/g, ''))
    .map(arg => arg.replaceAll(/\r\s+/g, ' '))
    .join(' ')
}

export function div(...args: string[]) {
  return args.join('\n\n')
}

// ul + li
export function ul(...args: string[]) {
  return args.map((arg) => {
    return `- ${arg}`
  }).join('\n')
}
