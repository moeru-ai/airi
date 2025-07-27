import type { DefaultTheme } from 'vitepress/theme'
import type { Ref } from 'vue'

import { useEventListener } from '@vueuse/core'
// Copied from https://github.com/vuejs/vitepress/blob/97f9469b6d4eb7ba9de9a1111986581d1f704ec3/src/client/theme-default/composables/outline.ts#L4
import { getScrollOffset } from 'vitepress'
import { onMounted, onUpdated } from 'vue'

export interface Header {
  /**
   * The level of the header
   *
   * `1` to `6` for `<h1>` to `<h6>`
   */
  level: number
  /**
   * The title of the header
   */
  title: string
  /**
   * The slug of the header
   *
   * Typically the `id` attr of the header anchor
   */
  slug: string
  /**
   * Link of the header
   *
   * Typically using `#${slug}` as the anchor hash
   */
  link: string
  /**
   * The children of the header
   */
  children: Header[]
}

// cached list of anchor elements from resolveHeaders
const resolvedHeaders: { element: HTMLHeadElement, link: string }[] = []

export type MenuItem = Omit<Header, 'slug' | 'children'> & {
  element: HTMLHeadElement
  children?: MenuItem[]
}

export function resolveTitle(theme: DefaultTheme.Config) {
  return (
    (typeof theme.outline === 'object'
      && !Array.isArray(theme.outline)
      && theme.outline.label)
    || theme.outlineTitle
    || 'On this page'
  )
}

export function getHeaders(range: DefaultTheme.Config['outline']) {
  const headers = [
    // @ts-expect-error copied script
    ...document.querySelectorAll('article :where(h1,h2,h3,h4,h5,h6)'),
  ]
    .filter(el => el.id && el.hasChildNodes())
    .map((el) => {
      const level = Number(el.tagName[1])
      return {
        element: el as HTMLHeadElement,
        title: serializeHeader(el),
        link: `#${el.id}`,
        level,
      }
    })

  return resolveHeaders(headers, range)
}

function serializeHeader(h: Element): string {
  let ret = ''
  // @ts-expect-error copied script
  for (const node of h.childNodes) {
    if (node.nodeType === 1) {
      if (
        (node as Element).classList.contains('VPBadge')
        || (node as Element).classList.contains('header-anchor')
        || (node as Element).classList.contains('ignore-header')
      ) {
        continue
      }
      ret += node.textContent
    }
    else if (node.nodeType === 3) {
      ret += node.textContent
    }
  }
  return ret.trim()
}

export function resolveHeaders(
  headers: MenuItem[],
  range?: DefaultTheme.Config['outline'],
): MenuItem[] {
  if (range === false) {
    return []
  }

  const levelsRange
    = (typeof range === 'object' && !Array.isArray(range)
      ? range.level
      : range) || 2

  const [high, low]: [number, number]
    = typeof levelsRange === 'number'
      ? [levelsRange, levelsRange]
      : levelsRange === 'deep'
        ? [2, 6]
        : levelsRange

  headers = headers.filter(h => h.level >= high && h.level <= low)
  // clear previous caches
  resolvedHeaders.length = 0
  // update global header list for active link rendering
  for (const { element, link } of headers) {
    resolvedHeaders.push({ element, link })
  }

  const ret: MenuItem[] = []
  // eslint-disable-next-line no-labels
  outer: for (let i = 0; i < headers.length; i++) {
    const cur = headers[i]
    if (i === 0) {
      ret.push(cur)
    }
    else {
      for (let j = i - 1; j >= 0; j--) {
        const prev = headers[j]
        if (prev.level < cur.level) {
          ;(prev.children || (prev.children = [])).push(cur)
          // eslint-disable-next-line no-labels
          continue outer
        }
      }
      ret.push(cur)
    }
  }

  return ret
}

export function useActiveAnchor(
  container: Ref<HTMLElement>,
  marker: Ref<HTMLElement>,
) {
  const onScroll = throttleAndDebounce(setActiveLink, 100)

  let prevActiveLink: HTMLAnchorElement | null = null

  onMounted(() => {
    requestAnimationFrame(setActiveLink)
  })

  onUpdated(() => {
    // sidebar update means a route change
    activateLink(location.hash)
  })

  useEventListener('scroll', onScroll)

  function setActiveLink() {
    const scrollY = window.scrollY
    const innerHeight = window.innerHeight
    const offsetHeight = document.body.offsetHeight
    const isBottom = Math.abs(scrollY + innerHeight - offsetHeight) < 1

    // resolvedHeaders may be repositioned, hidden or fix positioned
    const headers = resolvedHeaders
      .map(({ element, link }) => ({
        link,
        top: getAbsoluteTop(element),
      }))
      .filter(({ top }) => !Number.isNaN(top))
      .sort((a, b) => a.top - b.top)

    // no headers available for active link
    if (!headers.length) {
      activateLink(null)
      return
    }

    // page top
    if (scrollY < 1) {
      activateLink(null)
      return
    }

    // page bottom - highlight last link
    if (isBottom) {
      activateLink(headers[headers.length - 1].link)
      return
    }

    // find the last header above the top of viewport
    let activeLink: string | null = null
    for (const { link, top } of headers) {
      if (top > scrollY + getScrollOffset() + 4) {
        break
      }
      activeLink = link
    }
    activateLink(activeLink)
  }

  function activateLink(hash: string | null) {
    if (prevActiveLink) {
      prevActiveLink.classList.remove('active')
    }

    if (hash == null) {
      prevActiveLink = null
    }
    else {
      prevActiveLink = container.value.querySelector(
        `a[href="${decodeURIComponent(hash)}"]`,
      )
    }

    const activeLink = prevActiveLink

    if (activeLink) {
      activeLink.classList.add('active')
      marker.value.style.top = `${activeLink.offsetTop + 39}px`
      marker.value.style.opacity = '1'
    }
    else {
      marker.value.style.top = '33px'
      marker.value.style.opacity = '0'
    }
  }
}

function getAbsoluteTop(element: HTMLElement): number {
  let offsetTop = 0
  while (element !== document.body) {
    if (element === null) {
      // child element is:
      // - not attached to the DOM (display: none)
      // - set to fixed position (not scrollable)
      // - body or html element (null offsetParent)
      return Number.NaN
    }
    offsetTop += element.offsetTop
    element = element.offsetParent as HTMLElement
  }
  return offsetTop
}

function throttleAndDebounce(fn: () => void, delay: number): () => void {
  let timeoutId: NodeJS.Timeout
  let called = false

  return () => {
    if (timeoutId)
      clearTimeout(timeoutId)

    if (!called) {
      fn()
      ;(called = true) && setTimeout(() => (called = false), delay)
    }
    else {
      timeoutId = setTimeout(fn, delay)
    }
  }
}
