import enUS from './en-US'
import zhCN from './zh-CN'

// TODO: compact locales, such as 'en' can be 'en-US'
const locales = {
  'en-US': enUS,
  'zh-CN': zhCN,
}

type Message = typeof locales['en-US']
type KeyOfExcludeSymbol<T> = Exclude<keyof T, symbol>
type ValueOf<T> = T[KeyOfExcludeSymbol<T>]
type PathOf<T, Root extends boolean = true> = T extends Array<any> ? number : T extends string ? '' : Root extends true ? `${KeyOfExcludeSymbol<T>}${PathOf<ValueOf<T>, false>}` : `.${KeyOfExcludeSymbol<T>}${PathOf<ValueOf<T>, false>}`
type LocalePath = PathOf<Message>

export function createI18n() {
  let locale = 'en-US'
  let messages = locales['en-US']

  function t(key: LocalePath) {
    const path = key.split('.')
    let current = messages
    let result = ''

    while (path.length > 0) {
      const k = path.shift()
      if (k && current && k in current) {
        current = current[k]
      }
      else {
        return key
      }
    }

    if (typeof current === 'string') {
      result = current
    }

    return result
  }

  function setLocale(l: string) {
    locale = l
    messages = locales[l]
  }

  return {
    t,
    setLocale,
    locale,
  }
}

export type I18n = ReturnType<typeof createI18n>
