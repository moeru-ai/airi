<script setup lang="ts">
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()

const cardStore = useAiriCardStore()
const { cards, wakeWordConflicts } = storeToRefs(cardStore)
const { t } = useI18n()
function tt(key: string, values?: Record<string, string | number>) {
  return values
    ? t(`settings.pages.card.wake-word-conflict.${key}`, values)
    : t(`settings.pages.card.wake-word-conflict.${key}`)
}
const unresolvedCount = computed(() => wakeWordConflicts.value.filter(conflict => !conflict.ownerCardId).length)

function cardLabel(id: string) {
  const name = cards.value.get(id)?.name ?? id
  return `${name} (${id.slice(0, 6)})`
}

async function choose(sequence: string, cardId: string) {
  const assigned = await cardStore.assignWakeWordOwner(sequence, cardId)
  if (assigned && unresolvedCount.value === 0)
    emit('update:modelValue', false)
}
</script>

<template>
  <DialogRoot :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogPortal>
      <DialogOverlay :class="['fixed inset-0 z-100 bg-black/50 backdrop-blur-sm']" />
      <DialogContent
        :class="[
          'fixed left-1/2 top-1/2 z-100 max-h-[80dvh] max-w-lg w-[calc(100vw-2rem)] overflow-y-auto',
          'rounded-2xl bg-white p-6 shadow-xl outline-none -translate-x-1/2 -translate-y-1/2',
          'dark:bg-neutral-900',
        ]"
      >
        <DialogTitle :class="['text-lg text-neutral-900 font-medium dark:text-neutral-50']">
          {{ tt('title') }}
        </DialogTitle>
        <DialogDescription :class="['mt-2 text-sm text-neutral-600 dark:text-neutral-300']">
          {{ tt('description') }}
        </DialogDescription>

        <div :class="['mt-5 flex flex-col gap-4']">
          <section
            v-for="conflict in wakeWordConflicts"
            :key="conflict.sequence"
            :class="['rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]']"
          >
            <p :class="['mb-3 break-all text-xs text-neutral-500 dark:text-neutral-400']">
              {{ tt('pronunciation', { tokens: conflict.sequence }) }}
            </p>
            <p v-if="conflict.ownerCardId" :class="['mb-3 text-sm text-green-600 dark:text-green-400']">
              {{ tt('active', { name: cardLabel(conflict.ownerCardId) }) }}
            </p>
            <div :class="['flex flex-wrap gap-2']">
              <Button
                v-for="id in conflict.cardIds"
                :key="id"
                :label="tt('choose', { name: cardLabel(id) })"
                :color="conflict.ownerCardId === id ? 'primary' : undefined"
                @click="choose(conflict.sequence, id)"
              />
            </div>
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
