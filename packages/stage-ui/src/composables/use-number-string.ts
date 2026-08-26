import type { Ref } from 'vue'

// packages/stage-ui/src/composables/useNumberString.ts
import { computed } from 'vue'

export function useNumberString(numberRef: Ref<number | null>) {
  return computed({
    get: () => numberRef.value?.toString() ?? '',
    set: (value) => {
      if (value === '') {
        numberRef.value = null
        return
      }
      const numValue = Number.parseInt(value, 10)
      if (!Number.isNaN(numValue)) {
        numberRef.value = numValue
      }
    },
  })
}
