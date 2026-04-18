import { defineComponent, h } from 'vue'

export default defineComponent({
  name: 'LessonHeaderStub',
  setup() {
    return () => h('div', { 'data-testid': 'lesson-header-stub' })
  },
})
