import type { Ref } from 'vue'

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useCssVariables } from './useCssVar'

describe('useCssVariables', () => {
  let app: any

  beforeEach(() => {
    // clear any existing variables that might interfere
    Array.from(document.documentElement.style)
      .forEach(v => document.documentElement.style.removeProperty(v))

    // Create a mock element for testing custom targets if needed
    const mockEl = document.createElement('div')
    mockEl.id = 'mock-target'
    document.body.appendChild(mockEl)
  })

  afterEach(() => {
    app?.unmount()
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('variable reactivity via getter', async () => {
    const color = ref('blue')
    const getter = () => ({ '--color': color.value }) // important: '--' is not added automatically

    app = mount({
      setup() {
        return useCssVariables(getter)
      },
      template: '<div></div>',
    })

    await nextTick()
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('blue')

    // Change the ref
    color.value = 'green'
    await nextTick()
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('green')
  })

  it('appending prefix to variable name', async () => {
    const color = ref('blue')
    const getter = () => ({ color: color.value })

    app = mount({
      setup() {
        return useCssVariables(getter, { prefix: '--' })
      },
      template: '<div></div>',
    })

    await nextTick()
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('blue')
    // does not set variables with no prefix
    expect(document.documentElement.style.getPropertyValue('color')).toBe('')
    // concatenate without separator '-'
    expect(document.documentElement.style.getPropertyValue('---color')).toBe('')

    // Change the ref
    color.value = 'green'
    await nextTick()
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('green')
  })

  it('variable reactivity via reactive source', async () => {
    // the object key should start with double hyphens('--')
    const vars: Ref<{ '--color'?: string, '--size'?: string }> = ref({ '--color': 'red', '--size': '10px' })

    app = mount({
      setup() {
        return useCssVariables(vars)
      },
      template: '<div></div>',
    })

    await nextTick()
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('red')
    expect(document.documentElement.style.getPropertyValue('--size')).toBe('10px')

    delete vars.value['--color']
    await nextTick()

    expect(document.documentElement.style.getPropertyValue('--color')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--size')).toBe('10px')
  })

  it('remove when value becomes null or undefined', async () => {
    const vars = ref({ color: 'red', size: '10px' })
    const getter = () => vars.value

    app = mount({
      setup() {
        return useCssVariables(getter, { prefix: '--' })
      },
      template: '<div></div>',
    })

    await nextTick()
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('red')
    expect(document.documentElement.style.getPropertyValue('--size')).toBe('10px')

    vars.value.color = null as any
    await nextTick()
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('')

    vars.value.size = undefined as any
    await nextTick()
    expect(document.documentElement.style.getPropertyValue('--size')).toBe('')
  })

  it('reactive element scoping', async () => {
    const mockEl = document.getElementById('mock-target')
    if (!mockEl)
      throw new Error('Mock element not found')

    const color = ref('purple')
    const getter = () => ({ color: color.value })

    const elementGetter = ref(mockEl)

    app = mount({
      setup() {
        return useCssVariables(getter, { elementGetter, prefix: '--' })
      },
      template: '<div></div>',
    })
    await nextTick()
    // Should be on the mock element, not documentElement
    expect(mockEl.style.getPropertyValue('--color')).toBe('purple')
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('')
  })

  it('element scoping with possible null getter', async () => {
    const mockEl = document.getElementById('mock-target')
    if (!mockEl)
      throw new Error('Mock element not found')

    const color = ref('purple')
    const getter = () => ({ color: color.value })

    const elementGetter = ref<HTMLElement | null>(null)

    app = mount({
      setup() {
        return useCssVariables(getter, { elementGetter, prefix: '--' })
      },
      template: '<div></div>',
    })
    await nextTick()
    expect(mockEl.style.getPropertyValue('--color')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('') // don't leak to global scope

    elementGetter.value = mockEl
    await nextTick()
    expect(mockEl.style.getPropertyValue('--color')).toBe('purple') // reactivity
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('')
  })

  it('clean up on unmount', async () => {
    const color = ref('red')
    const getter = () => ({ color: color.value })

    app = mount({
      setup() {
        return useCssVariables(getter, { prefix: '--' })
      },
      template: '<div></div>',
    })
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('red')

    app.unmount()
    expect(document.documentElement.style.getPropertyValue('--color')).toBe('')
  })
})
