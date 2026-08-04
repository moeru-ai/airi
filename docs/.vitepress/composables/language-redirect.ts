// Redirects prefix-less or mismatched language paths to the matching language
// version based on the browser language.
//
// The redirect only happens while the user has never "chosen" a language
// (no localStorage entry). Once any language page has been visited,
// rememberLanguageFromPath records that language, so later visits are not
// auto-redirected and the manual choice is respected.

const LANGUAGE_STORAGE_KEY = 'docs:settings/language'
// Matches the language segment of a base-stripped path (e.g. "zh-Hans/docs").
const LANGUAGE_PREFIX_PATTERN = /^(en|zh-Hans|ja|ko)(?:\/|$)/
// Matches the language segment of a VitePress route path (e.g. "/zh-Hans/docs").
const LANGUAGE_PATH_PATTERN = /\/(en|zh-Hans|ja|ko)(?:\/|$)/

let redirecting = false

/** Maps the browser's preferred language to a site language version (aligned with the locales in config.ts). */
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

/** Extracts the language prefix from a VitePress route path; a prefix-less path belongs to the default language (en). */
function languageFromPath(pathname: string): string {
  const match = pathname.match(LANGUAGE_PATH_PATTERN)
  return match?.[1] ?? 'en'
}

/**
 * Computes the redirect target for a full window pathname (base included).
 * Returns undefined when the path already matches the target language.
 *
 * The language segment lives right after the base path, e.g. `/airi/zh-Hans/`
 * on GitHub Pages or `/zh-Hans/` locally. A path without a language segment
 * belongs to the default language (en).
 */
export function computeLanguageRedirectPath(pathname: string, base: string, target: string): string | undefined {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname
  const restMatch = rest.match(LANGUAGE_PREFIX_PATTERN)
  const current = restMatch?.[1] ?? 'en'
  if (current === target)
    return undefined

  const targetRest = restMatch
    ? rest.replace(new RegExp(`^${restMatch[1]}(?=/|$)`), target)
    : `${target}/${rest}`

  return `${base}${targetRest}`
}

/**
 * Called during client app initialization (before page components mount).
 * Redirects to the target language path when the user has never chosen a
 * language and the browser language differs from the current path's language.
 * en is the default language and is never redirected.
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
  const targetPath = computeLanguageRedirectPath(pathname, import.meta.env.BASE_URL, target)
  if (!targetPath)
    return

  redirecting = true
  window.location.replace(`${targetPath}${window.location.search}${window.location.hash}`)
}

/**
 * Records the language of the page the user actually visited (called by Layout
 * on mount and on route changes). Skips recording while an automatic redirect
 * is in flight, so the redirected-away page's language is not mistaken for the
 * user's choice.
 */
export function rememberLanguageFromPath(pathname: string): void {
  if (typeof window === 'undefined' || redirecting)
    return
  const language = languageFromPath(pathname)
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
}
