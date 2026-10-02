import type { Ref } from 'vue'

import { computed } from 'vue'

/**
 * A number field model that keeps the stored value when the field is empty or invalid.
 *
 * Use when:
 * - A settings field must stay positive, or whole, or accept zero as a switch-off value.
 */
export function positiveNumberModel(source: Ref<number>, options: { integer?: boolean, allowZero?: boolean } = {}) {
  return computed({
    get: () => source.value,
    set(value: number | undefined) {
      if (value === undefined || !Number.isFinite(value) || value < 0 || (value === 0 && !options.allowZero))
        return
      if (options.integer && !Number.isInteger(value))
        return
      source.value = value
    },
  })
}
