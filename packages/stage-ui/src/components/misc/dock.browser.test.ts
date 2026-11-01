import { Dock, DockButton, DropdownMenu, MenuItem } from '@proj-airi/ui'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, ref } from 'vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

function tooltipWrapper() {
  return document.querySelector<HTMLElement>('[data-reka-popper-content-wrapper]')
}

/** The text of the open tooltip. Reka UI names the tooltip in a visually hidden `role="tooltip"` element. */
function tooltipText() {
  return document.querySelector('[role="tooltip"]')?.textContent ?? null
}

describe('dock', () => {
  afterEach(() => cleanup())

  it('shows the label of a button as a tooltip below a horizontal dock', async () => {
    const screen = render(defineComponent({
      components: { Dock, DockButton },
      template: `<div style="padding: 80px"><Dock><DockButton icon="i-lucide:minimize-2" label="Hide chat" /></Dock></div>`,
    }))
    const button = screen.getByRole('button', { name: 'Hide chat' })

    await userEvent.hover(button)

    await expect.poll(tooltipText).toBe('Hide chat')
    expect(tooltipWrapper()!.getBoundingClientRect().top).toBeGreaterThanOrEqual(button.element().getBoundingClientRect().bottom)
  })

  it('marks a toggle and swaps its icon, and leaves a plain action unmarked', async () => {
    const pinned = ref(false)
    const screen = render(defineComponent({
      components: { Dock, DockButton },
      setup: () => ({ pinned }),
      template: `
        <Dock>
          <DockButton icon="i-solar:pin-linear" pressed-icon="i-solar:pin-bold-duotone" label="Keep on top" :pressed="pinned" @click="pinned = !pinned" />
          <DockButton icon="i-lucide:minimize-2" label="Hide chat" />
        </Dock>
      `,
    }))
    const toggle = screen.getByRole('button', { name: 'Keep on top' })

    await expect.element(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle.element().querySelector('.i-solar\\:pin-linear')).not.toBeNull()

    await toggle.click()

    await expect.element(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle.element().querySelector('.i-solar\\:pin-bold-duotone')).not.toBeNull()
    await expect.element(screen.getByRole('button', { name: 'Hide chat' })).not.toHaveAttribute('aria-pressed')
  })

  it('anchors the tooltip of a menu trigger to the button, and still opens the menu', async () => {
    // ROOT CAUSE:
    //
    // If a tooltip wraps a menu, the tooltip stays off screen.
    // This happens because Reka UI gives each popup the nearest popper root, the root of the menu.
    //
    // <Tooltip><DropdownMenu>…</DropdownMenu></Tooltip>
    //
    // We fixed this by putting the tooltip inside the menu trigger.
    // <DropdownMenu><template #trigger><DockButton /></template></DropdownMenu>
    const screen = render(defineComponent({
      components: { DockButton, DropdownMenu, MenuItem },
      template: `
        <div style="padding: 80px">
          <DropdownMenu>
            <template #trigger>
              <DockButton icon="i-solar:layers-minimalistic-bold-duotone" label="Chat window style" />
            </template>
            <MenuItem>Floating</MenuItem>
          </DropdownMenu>
        </div>
      `,
    }))
    const button = screen.getByRole('button', { name: 'Chat window style' })
    const element = button.element()

    await userEvent.hover(button)

    await expect.poll(tooltipText).toBe('Chat window style')
    expect(tooltipWrapper()!.getBoundingClientRect().top).toBeGreaterThanOrEqual(element.getBoundingClientRect().bottom)

    await button.click()

    await expect.element(page.getByRole('menuitem', { name: 'Floating' })).toBeVisible()
    expect(element.getAttribute('aria-expanded')).toBe('true')
  })

  it('closes an open tooltip when the button turns it off', async () => {
    const tooltip = ref(true)
    const screen = render(defineComponent({
      components: { DockButton },
      setup: () => ({ tooltip }),
      template: `<div style="padding: 80px"><DockButton icon="i-solar:hourglass-line-bold-duotone" label="Hide read messages" :tooltip="tooltip" /></div>`,
    }))
    await userEvent.hover(screen.getByRole('button', { name: 'Hide read messages' }))
    await expect.poll(tooltipText).toBe('Hide read messages')

    tooltip.value = false

    await expect.poll(tooltipText).toBeNull()
  })

  // https://github.com/moeru-ai/airi/pull/3295#discussion_r4435068574
  it('stays inside a narrow parent, so a long name truncates', async () => {
    // ROOT CAUSE:
    //
    // If the name is long, the dock overflows its parent and pushes its buttons out of the window.
    // This happens because `w-fit` never goes below the min-content width of the dock.
    //
    // We fixed this by adding `max-w-full` to the dock.
    const screen = render(defineComponent({
      components: { Dock, DockButton },
      template: `
        <div data-testid="row" style="width: 200px; display: flex">
          <div style="min-width: 0">
            <Dock data-testid="dock">
              <DockButton icon="i-lucide:minimize-2" label="Hide chat" />
              <button style="min-width: 0; display: flex">
                <span data-testid="name" class="truncate">A very long character name that does not fit</span>
              </button>
            </Dock>
          </div>
        </div>
      `,
    }))
    const row = screen.getByTestId('row').element().getBoundingClientRect()
    const name = screen.getByTestId('name').element()

    expect(screen.getByTestId('dock').element().getBoundingClientRect().right).toBeLessThanOrEqual(row.right)
    expect(name.clientWidth).toBeLessThan(name.scrollWidth)
  })

  it('lets the background through a blurry dock with the given opacity and blur', async () => {
    const screen = render(defineComponent({
      components: { Dock, DockButton },
      template: `<Dock data-testid="dock" variant="blurry" :opacity="0.5" :blur="20"><DockButton icon="i-lucide:minimize-2" label="Hide chat" /></Dock>`,
    }))
    const style = getComputedStyle(screen.getByTestId('dock').element())

    expect(style.backdropFilter).toContain('blur(20px)')
    expect(style.backgroundColor).toMatch(/0\.5\)$/)
  })
})
