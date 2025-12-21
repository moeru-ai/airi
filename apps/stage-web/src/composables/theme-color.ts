import type { Ref } from 'vue'

import type CustomizedBackground from '../components/Backgrounds/CustomizedBackground.vue'
import type { BackgroundSelection } from '../stores/background'

import Color from 'colorjs.io'

import { withRetry } from '@moeru/std'
import { colorFromElement } from '@proj-airi/stage-ui/libs'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { useIntervalFn } from '@vueuse/core'
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
  const settings = useSettings()

  let samplingToken = 0

  function getWaveThemeColor() {
    const isDark = document.documentElement.classList.contains('dark')
    // We read directly from computed style to catch the animation value
    const hue = getComputedStyle(document.documentElement).getPropertyValue('--chromatic-hue') || '220.44'
    return isDark ? `hsl(${hue} 60% 32%)` : `hsl(${hue} 75% 78%)`
  }

  const { updateThemeColor } = useThemeColor(() => {
    if (selectedOption.value?.kind === 'wave') {
      return getWaveThemeColor()
    }
    return sampledColor.value || '#0f172a'
  })

  // Keep theme-color reasonably fresh for animated wave backgrounds without doing per-frame work.
  const { pause, resume } = useIntervalFn(() => {
    if (document.visibilityState !== 'visible')
      return
    if (selectedOption.value?.kind === 'wave' && settings.themeColorsHueDynamic)
      void updateThemeColor()
  }, 250, { immediate: false })

  watch([() => selectedOption.value?.kind, () => settings.themeColorsHueDynamic], ([kind, dynamic]) => {
    if (kind === 'wave' && dynamic) {
      void updateThemeColor()
      resume()
    }
    else {
      pause()
    }
  }, { immediate: true })

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
    const token = ++samplingToken
    const optionId = selectedOption.value?.id
    if (selectedOption.value?.kind === 'wave') {
      await updateThemeColor()
      return
    }

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
    if (token !== samplingToken)
      return
    if (optionId && selectedOption.value?.id !== optionId)
      return

    if (color) {
      sampledColor.value = color
      await updateThemeColor()
    }
  }

  async function syncBackgroundTheme() {
    if (selectedOption.value?.kind === 'wave') {
      await updateThemeColor()
    }
    else if (sampledColor.value) {
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
