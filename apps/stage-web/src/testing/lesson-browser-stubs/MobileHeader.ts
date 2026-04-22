import { defineComponent, h } from 'vue'

export default defineComponent({
  name: 'LessonMobileHeaderStub',
  setup() {
    return () => h('div', { 'data-testid': 'lesson-mobile-header-stub' })
  },
})
