import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'

import { useAudioAnalyzer } from './audio-analyzer'

afterEach(() => {
  vi.useRealTimers()
})

function mountAnalyzer() {
  let analyzer!: ReturnType<typeof useAudioAnalyzer>
  render(defineComponent({
    setup() {
      analyzer = useAudioAnalyzer()
      return () => null
    },
  }))
  return analyzer
}

it('updates the level 20 times each second, not on each animation frame', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'] })
  const context = new AudioContext()
  onTestFinished(() => context.close())
  const analyzer = mountAnalyzer()
  const updates = vi.fn()
  analyzer.onAnalyzerUpdate(updates)

  analyzer.startAnalyzer(context)
  vi.advanceTimersByTime(1000)
  // One level at the start, then one each 50 ms.
  expect(updates).toHaveBeenCalledTimes(21)

  analyzer.stopAnalyzer()
  vi.advanceTimersByTime(1000)
  expect(updates).toHaveBeenCalledTimes(21)
})
