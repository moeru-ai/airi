import { useData, withBase } from 'vitepress'
import { computed } from 'vue'

import { data as blogPosts } from '../functions/blog.data'
import { getFlatSideBarLinks, getSidebar, isActive } from './sidebar'

/**
 * Compute previous/next navigation targets for the current page.
 * - For blog pages, keeps navigation within the same language blog directory.
 * - For docs pages, falls back to sidebar-based navigation.
 * - Respects frontmatter overrides and hides when disabled.
 */
export function usePrevNext() {
  const { page, theme, frontmatter, lang } = useData()

  return computed(() => {
    // Blog-specific navigation: ensure next/prev stay within same language blog directory
    // This handles the case where clicking the next button on a blog post should navigate
    // to the next post within `/zh-Hans/blog/` or `/en/blog/`, preserving language prefix.
    const isBlogPage = page.value.relativePath.includes('/blog/')

    // Determine visibility from theme/frontmatter first
    const hidePrev
      = (theme.value.docFooter?.prev === false && !frontmatter.value.prev)
        || frontmatter.value.prev === false

    const hideNext
      = (theme.value.docFooter?.next === false && !frontmatter.value.next)
        || frontmatter.value.next === false

    if (isBlogPage) {
      // Filter posts by current language and exclude blog index page
      const sameLangPosts = blogPosts
        .filter(p => p.lang === (lang.value || 'en'))
        .filter(p => p.urlWithoutLang !== '/blog/')

      // Find current post index by matching normalized URLs
      let currentPath = page.value.relativePath
      if (currentPath.startsWith('/')) {
        currentPath = currentPath.slice(1)
      }

      const currentUrl = withBase(`/${currentPath}`)
      const currentIndex = sameLangPosts.findIndex(p => isActive(currentUrl, withBase(p.url)))

      // Gracefully handle not found index
      const prevPost = currentIndex > 0 ? sameLangPosts[currentIndex - 1] : undefined
      const nextPost = currentIndex >= 0 && currentIndex < sameLangPosts.length - 1 ? sameLangPosts[currentIndex + 1] : undefined

      // For blog pages, do NOT render next when it's the last article,
      // even if frontmatter provides a manual next link.
      const blogPrev = hidePrev
        ? undefined
        : prevPost
          ? {
              text:
                (typeof frontmatter.value.prev === 'string'
                  ? frontmatter.value.prev
                  : typeof frontmatter.value.prev === 'object'
                    ? frontmatter.value.prev.text
                    : undefined)
                  ?? prevPost.title,
              link: withBase(prevPost.url),
            }
          : undefined

      const blogNext = hideNext
        ? undefined
        : nextPost
          ? {
              text:
                (typeof frontmatter.value.next === 'string'
                  ? frontmatter.value.next
                  : typeof frontmatter.value.next === 'object'
                    ? frontmatter.value.next.text
                    : undefined)
                  ?? nextPost.title,
              link: withBase(nextPost.url),
            }
          : undefined

      return {
        prev: blogPrev,
        next: blogNext,
      } as {
        prev?: { text?: string, link?: string }
        next?: { text?: string, link?: string }
      }
    }

    // Default docs navigation via sidebar for non-blog pages
    const sidebar = getSidebar(theme.value.sidebar, page.value.relativePath)
    const links = getFlatSideBarLinks(sidebar)

    // ignore inner-page links with hashes
    let candidates = uniqBy(links, link => link.link.replace(/[?#].*$/, ''))

    // Restrict docs navigation within the same docs section (e.g., overview vs manual)
    // This prevents crossing into unrelated sections like `/zh-Hans/docs/manual/`.
    let normalizedPath = page.value.relativePath
    if (normalizedPath.startsWith('/')) {
      normalizedPath = normalizedPath.slice(1)
    }
    const currentFullUrl = withBase(`/${normalizedPath}`)
    const sectionPrefix = getDocsSectionPrefix(currentFullUrl)
    if (sectionPrefix) {
      const sectionBase = withBase(sectionPrefix)
      // If current page is the section root (e.g., /zh-Hans/docs/overview/),
      // do not render prev/next for docs to avoid showing a next button here.
      const isSectionRoot = currentFullUrl.replace(/[?#].*$/, '') === sectionBase
      if (isSectionRoot) {
        return {
          prev: undefined,
          next: undefined,
        } as { prev?: { text?: string, link?: string }, next?: { text?: string, link?: string } }
      }
      // Keep navigation within the same docs section and exclude the section root itself
      // to avoid showing a "next" link that points back to the section index.
      const filtered = candidates
        .filter(l => l.link.replace(/[?#].*$/, '').startsWith(sectionBase))
        .filter(l => l.link.replace(/[?#].*$/, '') !== sectionBase)
      // Fallback to all candidates if filter would drop the current page
      const wouldDropCurrent = filtered.findIndex(l => isActive(currentFullUrl, l.link)) < 0
      if (!wouldDropCurrent) {
        candidates = filtered
      }
    }

    const index = candidates.findIndex((link) => {
      let path = page.value.relativePath
      if (path.startsWith('/')) {
        path = path.slice(1)
      }

      return isActive(withBase(`/${path}`), link.link)
    })

    return {
      prev: hidePrev || index <= 0
        ? undefined
        : {
            text:
              (typeof frontmatter.value.prev === 'string'
                ? frontmatter.value.prev
                : typeof frontmatter.value.prev === 'object'
                  ? frontmatter.value.prev.text
                  : undefined)
                ?? candidates[index - 1]?.docFooterText
                ?? candidates[index - 1]?.text,
            link:
              (typeof frontmatter.value.prev === 'object'
                ? frontmatter.value.prev.link
                : undefined) ?? candidates[index - 1]?.link,
          },
      next: hideNext || index < 0 || index >= candidates.length - 1
        ? undefined
        : {
            text:
              (typeof frontmatter.value.next === 'string'
                ? frontmatter.value.next
                : typeof frontmatter.value.next === 'object'
                  ? frontmatter.value.next.text
                  : undefined)
                ?? candidates[index + 1]?.docFooterText
                ?? candidates[index + 1]?.text,
            link:
              (typeof frontmatter.value.next === 'object'
                ? frontmatter.value.next.link
                : undefined) ?? candidates[index + 1]?.link,
          },
    } as {
      prev?: { text?: string, link?: string }
      next?: { text?: string, link?: string }
    }
  })
}

/**
 * Extract docs section prefix like `/<lang>/docs/<section>/` from a full URL.
 * Keeps navigation within the same section to avoid crossing into unrelated docs.
 */
function getDocsSectionPrefix(fullUrl: string): string | undefined {
  const m = fullUrl.match(/\/(en|zh-Hans)\/docs\/([^/]+)\//)
  return m ? `/${m[1]}/docs/${m[2]}/` : undefined
}

/**
 * Returns a unique array by key function result.
 * Used to remove inner-page duplicate links based on URL normalization.
 */
function uniqBy<T>(array: T[], keyFn: (item: T) => any): T[] {
  const seen = new Set()
  return array.filter((item) => {
    const k = keyFn(item)
    return seen.has(k) ? false : seen.add(k)
  })
}
