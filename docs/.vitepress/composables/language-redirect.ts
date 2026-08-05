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

// All site pages (content/**/*.md), normalized to base-less paths like
// "/zh-Hans/docs/overview". Used to skip redirects to languages that have no
// translated counterpart for the current path. The glob is relative to this
// file (docs/.vitepress/composables/), hence the ../../content prefix.
const PAGE_PATHS = new Set(
  Object.keys(import.meta.glob('../../content/**/*.md'))
    .map(key => key.replace(/^\.\.\/\.\.\/content\//, '').replace(/\.md$/, ''))
    .map(relative => `/${relative}`.replace(/\/index$/, '').replace(/\/+$/, '')),
)

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
 * on GitHub Pages or `/zh-Hans/` locally. A path without a language segment is
 * not a real page (content lives under language prefixes), so the target is
 * always built — including English, which restores legacy/root URLs like `/`
 * to the `/en/` tree instead of leaving them on the generated 404 page.
 */
export function computeLanguageRedirectPath(pathname: string, base: string, target: string): string | undefined {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname
  const restMatch = rest.match(LANGUAGE_PREFIX_PATTERN)
  if (!restMatch)
    return `${base}${target}/${rest}`

  const current = restMatch[1]
  if (current === target)
    return undefined

  return `${base}${rest.replace(new RegExp(`^${current}(?=/|$)`), target)}`
}

/**
 * Checks whether a redirect target exists among the site's pages. Newly added
 * pages may only exist in one language; redirecting to a missing translation
 * would turn valid deep links into 404s, so such paths must stay put.
 */
export function hasLocalizedPage(targetPath: string, base: string): boolean {
  const rest = targetPath.startsWith(base) ? targetPath.slice(base.length) : targetPath
  const normalized = `/${rest}`.replace(/\/+$/, '')
  return PAGE_PATHS.has(normalized)
}

/**
 * Called during client app initialization (before page components mount).
 *
 * Prefix-less paths (e.g. `/`, `/docs/overview/`) are not real pages — the
 * content tree lives under language prefixes — so they always redirect:
 * to the browser language when a localized counterpart exists, otherwise
 * falling back to English. Prefixed paths only redirect when the browser
 * language differs and a localized page exists. Redirects are skipped once
 * the user has chosen a language (localStorage entry).
 */
export function applyLanguageRedirect(): void {
  if (typeof window === 'undefined')
    return
  if (window.localStorage.getItem(LANGUAGE_STORAGE_KEY) !== null)
    return

  const pathname = window.location.pathname
  const base = import.meta.env.BASE_URL
  // Unsupported browser languages fall back to English.
  const target = languageFromNavigator() ?? 'en'
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname
  const restMatch = rest.match(LANGUAGE_PREFIX_PATTERN)

  const candidates = restMatch
    ? [target]
    : [...new Set([target, 'en'])]

  for (const language of candidates) {
    const targetPath = computeLanguageRedirectPath(pathname, base, language)
    if (!targetPath || !hasLocalizedPage(targetPath, base))
      continue

    redirecting = true
    window.location.replace(`${targetPath}${window.location.search}${window.location.hash}`)
    return
  }
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
