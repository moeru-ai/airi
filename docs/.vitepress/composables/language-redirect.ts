// Redirects prefix-less or mismatched language paths to the matching language
// version based on the browser language.
//
// The redirect only happens while the user has never "chosen" a language
// (no localStorage entry). Once any language page has been visited,
// rememberLanguageFromPath records that language, so later visits are not
// auto-redirected and the manual choice is respected.

const LANGUAGE_STORAGE_KEY = 'docs:settings/language'
const LANGUAGE_PATH_PATTERN = /\/(en|zh-Hans|ja|ko)(\/|$)/

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

/** Extracts the language prefix from a path; a prefix-less path belongs to the default language (en). */
function languageFromPath(pathname: string): string {
  const match = pathname.match(LANGUAGE_PATH_PATTERN)
  return match?.[1] ?? 'en'
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
