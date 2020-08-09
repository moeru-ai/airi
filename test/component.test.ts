import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TheCounter from '../src/components/TheCounter.vue'

describe('component TheCounter.vue', () => {
  it('should render', () => {
    const wrapper = mount(TheCounter, { props: { initial: 10 } })
    expect(wrapper.text()).toContain('10')
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should be interactive', async () => {
    const wrapper = mount(TheCounter, { props: { initial: 0 } })
    expect(wrapper.text()).toContain('0')

    expect(wrapper.find('.inc').exists()).toBe(true)

    expect(wrapper.find('.dec').exists()).toBe(true)

    await wrapper.get('.inc').trigger('click')

    expect(wrapper.text()).toContain('1')

    await wrapper.get('.dec').trigger('click')

    expect(wrapper.text()).toContain('0')
  })
})
