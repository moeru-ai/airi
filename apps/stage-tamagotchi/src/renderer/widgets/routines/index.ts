import { defineAsyncComponent } from 'vue'

const RoutineCard = defineAsyncComponent(() => import('./routine-card.vue'))
export const routineWidgetComponents = {
  'routine-next': RoutineCard,
  'routine-agenda': RoutineCard,
}
