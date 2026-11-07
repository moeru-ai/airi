import { useL2dViewControl } from '@proj-airi/stage-ui-live2d/stores'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import PlacementPanel from './placement-panel.vue'
import PlacementSurface from './placement-surface.vue'

import 'virtual:uno.css'

const parameters = useL2dViewControl()

/** Uses the same persisted parameter refs as the model editor and the stage view controls. */
function renderPlacement(surfaces = 1) {
  const component = defineComponent({
    setup() {
      return () => h('div', Array.from({ length: surfaces }, (_, index) => h('section', { key: index }, [
        h('div', { style: { position: 'relative', width: '200px', height: '400px' } }, [
          h(PlacementSurface, {
            'data-testid': `surface-${index}`,
            'scale': parameters.scale.value,
            'position': parameters.position.value,
            'onUpdate:scale': (value: number) => { parameters.scale.value = value },
            'onUpdate:position': (value: { x: number, y: number }) => { parameters.position.value = value },
          }),
          h('div', { 'data-testid': `target-${index}`, 'style': { position: 'absolute', left: '140px', top: '230px', width: '20px', height: '20px' } }),
        ]),
        h(PlacementPanel, {
          'scale': parameters.scale.value,
          'position': parameters.position.value,
          'onUpdate:scale': (value: number) => { parameters.scale.value = value },
          'onUpdate:position': (value: { x: number, y: number }) => { parameters.position.value = value },
        }),
      ])))
    },
  })

  return render(component, {
    global: {
      plugins: [createI18n({
        legacy: false,
        locale: 'en',
        messages: { en: { settings: { pages: { models: { editor: {
          reset: 'Reset',
          tabs: { placement: 'Placement' },
          tools: { size: 'Size', position: 'Position' },
          position: { horizontal: 'Horizontal', vertical: 'Vertical', description: 'Drag the character, or use the rulers.' },
        } } } } } },
      })],
    },
  })
}

beforeEach(() => {
  parameters.scale.value = 1
  parameters.position.value = { x: 0, y: 0 }
})

afterEach(() => {
  cleanup()
  parameters.scale.value = 1
  parameters.position.value = { x: 0, y: 0 }
})

describe('shared mobile placement controls', () => {
  it('keeps two entry points synchronized and resets their shared scale', async () => {
    const screen = renderPlacement(2)
    await screen.getByRole('slider', { name: 'Size' }).first().click()
    await userEvent.keyboard('{ArrowRight}')

    await expect.poll(() => parameters.scale.value).toBe(1.01)
    await expect.element(screen.getByRole('slider', { name: 'Size' }).last()).toHaveAttribute('aria-valuetext', '1.01×')
    await expect.poll(() => localStorage.getItem('settings/live2d/scale')).toBe('1.01')

    await screen.getByRole('button', { name: 'Reset' }).first().click()

    await expect.poll(() => parameters.scale.value).toBe(1)
    await expect.element(screen.getByRole('slider', { name: 'Size' }).last()).toHaveAttribute('aria-valuenow', '1')
  })

  it('adjusts and resets each position axis without overwriting the other axis', async () => {
    const screen = renderPlacement()
    await screen.getByRole('button', { name: 'Position', exact: true }).click()
    await screen.getByRole('slider', { name: 'Horizontal' }).click()
    await userEvent.keyboard('{ArrowRight}')
    await screen.getByRole('slider', { name: 'Vertical' }).click()
    await userEvent.keyboard('{ArrowDown}')

    await expect.poll(() => parameters.position.value).toEqual({ x: 1, y: -1 })
    await expect.poll(() => JSON.parse(localStorage.getItem('settings/live2d/position') ?? 'null')).toEqual({ x: 1, y: -1 })

    await screen.getByRole('button', { name: 'Reset' }).first().click()

    await expect.poll(() => parameters.position.value).toEqual({ x: 0, y: -1 })
  })

  it('moves the model through captured browser pointers while leaving scale unchanged', async () => {
    const screen = renderPlacement()

    await userEvent.dragAndDrop(screen.getByTestId('surface-0'), screen.getByTestId('target-0'))

    await expect.poll(() => parameters.position.value).toEqual({ x: 25, y: -10 })
    expect(parameters.scale.value).toBe(1)
  })

  it('keeps ruler changes inside the same zoom limits as pinching', async () => {
    const screen = renderPlacement()
    await screen.getByRole('slider', { name: 'Size' }).click()
    await userEvent.keyboard('{End}{ArrowRight}')
    await expect.poll(() => parameters.scale.value).toBe(3)

    await userEvent.keyboard('{Home}{ArrowLeft}')

    await expect.poll(() => parameters.scale.value).toBe(0.1)
  })
})
