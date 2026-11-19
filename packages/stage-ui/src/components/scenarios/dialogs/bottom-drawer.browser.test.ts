import { BottomDrawer, GhostButton } from '@proj-airi/ui'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent, ref } from 'vue'

import 'virtual:uno.css'

const Harness = defineComponent({
  components: { BottomDrawer, GhostButton },
  setup() {
    return { open: ref(false), count: ref(0), closed: ref(0) }
  },
  template: `
    <BottomDrawer v-model="open" title="Stage" @after-close="closed++">
      <template #trigger><GhostButton>More</GhostButton></template>
      <GhostButton @click="count++">Change appearance</GhostButton>
      <output aria-label="Action count">{{ count }}</output>
    </BottomDrawer>
    <output aria-label="Completed dismissals">{{ closed }}</output>
  `,
})

describe('mobile tools drawer', () => {
  it('hides the heading without removing the accessible dialog name', async () => {
    const screen = await render(BottomDrawer, {
      props: { modelValue: true, title: 'Settings', hideTitle: true },
    })

    await expect.element(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    const title = screen.getByRole('heading', { name: 'Settings' }).element()
    expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(1)
  })

  it('allows opening focus on the drawer without highlighting an action', async () => {
    const screen = await render(BottomDrawer, {
      props: {
        modelValue: true,
        title: 'Settings',
        onOpenAutoFocus: (event: Event) => {
          event.preventDefault()
          if (event.target instanceof HTMLElement)
            event.target.focus()
        },
      },
      slots: { default: '<button>Background</button>' },
    })

    await expect.element(screen.getByRole('dialog', { name: 'Settings' })).toHaveFocus()
    await userEvent.keyboard('{Tab}')
    await expect.element(screen.getByRole('button', { name: 'Background' })).toHaveFocus()
  })

  // https://github.com/moeru-ai/airi/issues/2085
  it('keeps action clicks independent of drag dismissal for Issue #2085', async () => {
    // ROOT CAUSE:
    // Dragging from action controls can dismiss a Vaul sheet before click runs.
    // The shared drawer restricts drag initiation to its handle.
    const screen = await render(Harness)
    await screen.getByRole('button', { name: 'More' }).click()
    await screen.getByRole('button', { name: 'Change appearance' }).click()
    await screen.getByRole('button', { name: 'Change appearance' }).click()
    await expect.element(screen.getByLabelText('Action count')).toHaveTextContent('2')
    await expect.element(screen.getByRole('dialog', { name: 'Stage' })).toBeVisible()
    await expect.element(screen.getByLabelText('Completed dismissals')).toHaveTextContent('0')
  })

  it('restores trigger focus and reports dismissal once', async () => {
    const screen = await render(Harness)
    await screen.getByRole('button', { name: 'More' }).click()
    await expect.element(screen.getByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByLabelText('Completed dismissals')).toHaveTextContent('1')
    await expect.element(screen.getByRole('button', { name: 'More' })).toHaveFocus()
  })
})
