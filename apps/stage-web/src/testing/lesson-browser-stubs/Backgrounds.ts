import { defineComponent, h } from 'vue'

export const BackgroundProvider = defineComponent({
  name: 'LessonBackgroundProviderStub',
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'lesson-background-provider-stub' }, slots.default?.())
  },
})
