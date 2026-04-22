import { defineComponent, h } from 'vue'

export const WidgetStage = defineComponent({
  name: 'LessonWidgetStageStub',
  setup() {
    return () => h('div', { 'data-testid': 'lesson-widget-stage-stub' })
  },
})
