import { Screen } from '@proj-airi/ui'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent } from 'vue'

import 'virtual:uno.css'

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

/** Resizes the test page and waits for the resize event and the resize observers to run. */
async function resizeTo(width: number, height: number) {
  await page.viewport(width, height)
  await expect.poll(() => [innerWidth, innerHeight]).toEqual([width, height])
  await nextFrame()
  await nextFrame()
}

it('keeps the height of its own box when a resize changes one side at a time', async () => {
  // ROOT CAUSE:
  //
  // The window watcher wrote the parent height, and the bounding watcher wrote
  // the Screen box height. Under Stage's 400px minimum they differed, so the
  // Live2D model jumped whenever the last writer changed.
  //
  // We fixed this by measuring only the Screen box.
  await resizeTo(450, 350)
  const screen = render(defineComponent({
    components: { Screen },
    template: `<div style="position:fixed;inset:0;overflow:hidden">
      <Screen v-slot="{ height }" style="min-height:400px">
        <output>{{ height }}</output>
      </Screen>
    </div>`,
  }))
  const output = screen.container.querySelector('output')!
  await expect.poll(() => output.textContent).toBe('400')

  await resizeTo(450, 300)
  expect(output.textContent).toBe('400')
  await resizeTo(440, 300)
  expect(output.textContent).toBe('400')
  await resizeTo(440, 290)
  expect(output.textContent).toBe('400')
})

it('takes its width from its own box in a narrow window', async () => {
  // Below the lg breakpoint the slot width was the window width minus a guessed
  // 16px page padding, whatever box the Screen sat in.
  await resizeTo(450, 600)
  const screen = render(defineComponent({
    components: { Screen },
    template: `<div style="position:fixed;left:0;top:0;width:300px;height:200px">
      <Screen v-slot="{ width, height }">
        <output>{{ width }}x{{ height }}</output>
      </Screen>
    </div>`,
  }))
  const output = screen.container.querySelector('output')!

  await expect.poll(() => output.textContent).toBe('300x200')
})
