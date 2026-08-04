// 根据浏览器语言将无前缀/其他语言路径重定向到对应语言版本。
//
// 跳转仅在用户从未"选择"过语言（localStorage 无记录）时按浏览器语言执行；
// 用户访问过任何语言页面后，由 rememberLanguageFromPath 记录其语言，
// 后续访问不再自动跳转，避免与手动选择冲突。

const LANGUAGE_STORAGE_KEY = 'docs:settings/language'
const LANGUAGE_PATH_PATTERN = /\/(en|zh-Hans|ja|ko)(\/|$)/

let redirecting = false

/** 把浏览器首选语言映射到站点的语言版本（与 config.ts 的 locales 一致）。 */
function languageFromNavigator(): string | undefined {
  const first = navigator.language.toLowerCase()
  if (first.startsWith('zh'))
    return 'zh-Hans'
  if (first.startsWith('ja'))
    return 'ja'
  if (first.startsWith('ko'))
    return 'ko'
  if (first.startsWith('en'))
    return 'en'
  return undefined
}

/** 从路径中提取语言前缀；无语言前缀的路径属于默认语言（en）。 */
function languageFromPath(pathname: string): string {
  const match = pathname.match(LANGUAGE_PATH_PATTERN)
  return match?.[1] ?? 'en'
}

/**
 * 在客户端 app 初始化时调用（早于页面组件挂载）：
 * 用户未手动选择过语言、且浏览器语言与当前路径语言不一致时，
 * 302 等效地重定向到目标语言路径。en 为默认语言，无需跳转。
 */
export function applyLanguageRedirect(): void {
  if (typeof window === 'undefined')
    return
  if (window.localStorage.getItem(LANGUAGE_STORAGE_KEY) !== null)
    return

  const target = languageFromNavigator()
  if (!target || target === 'en')
    return

  const pathname = window.location.pathname
  const current = languageFromPath(pathname)
  if (current === target)
    return

  const targetPath = current === 'en'
    ? `/${target}${pathname}`
    : pathname.replace(new RegExp(`/(${current})(?=/|$)`), `/${target}`)

  redirecting = true
  window.location.replace(`${targetPath}${window.location.search}${window.location.hash}`)
}

/**
 * 记录用户实际访问的语言（Layout 在挂载与路由变化时调用）。
 * 正在执行自动重定向时不记录，避免把被跳走页面的语言误记为用户选择。
 */
export function rememberLanguageFromPath(pathname: string): void {
  if (typeof window === 'undefined' || redirecting)
    return
  const language = languageFromPath(pathname)
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
}
