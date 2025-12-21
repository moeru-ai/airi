import type { Ref } from 'vue'

import type CustomizedBackground from '../components/Backgrounds/CustomizedBackground.vue'
import type { BackgroundSelection } from '../stores/background'

import Color from 'colorjs.io'

import { withRetry } from '@moeru/std'
import { colorFromElement } from '@proj-airi/stage-ui/libs'
import { useTheme } from '@proj-airi/ui'
import { nextTick, watch } from 'vue'

export function themeColorFromPropertyOf(colorFromClass: string, property: string): () => Promise<string> {
  return async () => {
    const fetchUntilWidgetMounted = withRetry(() => {
      const widgets = document.querySelector(colorFromClass) as HTMLDivElement | undefined
      if (!widgets)
        throw new Error('Widgets element not found')

      return widgets
    }, { retry: 10, retryDelay: 1000 })

    const widgets = await fetchUntilWidgetMounted()
    return window.getComputedStyle(widgets).getPropertyValue(property)
  }
}

export function themeColorFromValue(value: string | { light: string, dark: string }): () => Promise<string> {
  return async () => {
    if (typeof value === 'string') {
      return value
    }
    else {
      const { isDark: dark } = useTheme()
      return dark.value ? value.dark : value.light
    }
  }
}

export function useThemeColor(colorFrom: () => string | Promise<string>) {
  async function updateThemeColor() {
    if (!('document' in globalThis) || globalThis.document == null)
      return
    if (!('window' in globalThis) || globalThis.window == null)
      return

    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', new Color(await colorFrom()).to('srgb').toString({ format: 'hex' }))
  }

  return {
    updateThemeColor,
  }
}

export function useBackgroundThemeColor({
  backgroundSurface,
  selectedOption,
  sampledColor,
}: {
  backgroundSurface: Ref<InstanceType<typeof CustomizedBackground> | undefined | null>
  selectedOption: Ref<BackgroundSelection | undefined>
  sampledColor: Ref<string>
}) {
  const { updateThemeColor } = useThemeColor(() => sampledColor.value || '#0f172a')

  async function waitForBackgroundReady() {
    await nextTick()
    const image = backgroundSurface.value?.surfaceEl?.querySelector('img')
    if (image && !image.complete) {
      await new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => reject(new Error('Background image failed to load')), { once: true })
      })
    }
  }

  // Exposed for optional manual triggers; also used within syncBackgroundTheme.
  async function sampleBackgroundColor() {
    const el = backgroundSurface.value?.surfaceEl
    if (!el)
      return

    await waitForBackgroundReady()

    const result = await colorFromElement(el, {
      mode: 'html2canvas',
      html2canvas: {
        region: {
          x: 0,
          y: 0,
          width: el.offsetWidth,
          height: Math.min(140, el.offsetHeight),
        },
        sampleHeight: 20,
        sampleStride: 10,
        scale: 0.5,
        backgroundColor: null,
        allowTaint: true,
        useCORS: true,
        onclone: (doc) => {
          doc.querySelectorAll('.theme-overlay').forEach((overlay) => {
            (overlay as HTMLElement).style.display = 'none'
          })

          // For wave backgrounds, providing a solid fallback color for html2canvas to pick up.
          doc.querySelectorAll('.colored-area').forEach((wave) => {
            const waveEl = wave as HTMLElement
            const isDark = document.documentElement.classList.contains('dark')
            const hue = getComputedStyle(document.documentElement).getPropertyValue('--chromatic-hue') || '200'
            waveEl.style.background = isDark ? `hsl(${hue} 60% 32%)` : `hsl(${hue} 75% 78%)`
          })
        },
      },
    })

    const color = result.html2canvas?.average
    if (color) {
      sampledColor.value = color
      await updateThemeColor()
    }
  }

  async function syncBackgroundTheme() {
    if (sampledColor.value && selectedOption.value?.kind !== 'wave') {
      await updateThemeColor()
    }
    else {
      await sampleBackgroundColor()
    }
  }

  watch([selectedOption], () => {
    syncBackgroundTheme()
  }, { immediate: true })

  watch(sampledColor, () => {
    syncBackgroundTheme()
  })

  watch(() => backgroundSurface.value?.surfaceEl, (el) => {
    if (el)
      syncBackgroundTheme()
  })

  return {
    sampledColor,
    sampleBackgroundColor,
    syncBackgroundTheme,
  }
}
