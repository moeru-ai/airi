import { BasicTextarea } from '@proj-airi/ui'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent } from 'vue'

it('keeps a mobile composer on one line until its content wraps', async () => {
  // ROOT CAUSE:
  // Resetting height to auto measured the native two-row minimum, so typing
  // one character changed the mobile textarea from 32px to 56px.
  // Even rows=1 still measured the flex parent's 40px minimum. Measure from
  // the configured single-line height instead of the stretched auto height.
  render(defineComponent({
    components: { BasicTextarea },
    template: `<div style="display:flex;min-height:40px">
      <BasicTextarea aria-label="Message" default-height="1lh"
        style="box-sizing:border-box;width:300px;font-size:16px;line-height:24px;padding:2px 16px;border:2px solid;min-height:32px" />
    </div>`,
  }))
  const input = page.getByRole('textbox', { name: 'Message' })
  const element = input.element()
  await expect.poll(() => element.getBoundingClientRect().height).toBe(32)
  await input.fill('a')
  await expect.poll(() => element.style.height).toBe('32px')
  expect(element.getBoundingClientRect().height).toBe(32)
  await input.fill('你好')
  await expect.poll(() => element.style.height).toBe('32px')
  expect(element.getBoundingClientRect().height).toBe(32)
  await input.fill('First line\nSecond line')
  await expect.poll(() => element.getBoundingClientRect().height).toBe(56)
  await input.fill('A long message '.repeat(12))
  await expect.poll(() => element.getBoundingClientRect().height).toBeGreaterThan(56)
  await input.fill('short')
  await expect.poll(() => element.getBoundingClientRect().height).toBe(32)
  await input.fill('')
  await expect.poll(() => element.getBoundingClientRect().height).toBe(32)
})
