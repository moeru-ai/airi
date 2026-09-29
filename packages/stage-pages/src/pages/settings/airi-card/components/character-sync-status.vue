<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useAiriCardCatalog } from '@proj-airi/stage-ui/stores/modules/airi-card-catalog'
import { Button } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ cardId?: string }>()
const catalog = useAiriCardCatalog()
const { t } = useI18n()
const pending = ref(false)
const error = ref('')
const conflicts = computed(() => catalog.currentRecord?.conflicts.filter(id => !props.cardId || id === props.cardId))
const hasPending = computed(() => {
  const record = catalog.currentRecord
  return record && record.ownerId !== 'local' && (record.deletions.length > 0 || Object.values(record.writes).some(writes => writes.length > 0))
})

async function synchronize(id?: string, choice?: 'local' | 'remote') {
  if (pending.value)
    return
  pending.value = true
  error.value = ''
  try {
    if (id && choice)
      await catalog.resolveConflict(id, choice)
    await catalog.syncContacts()
  }
  catch (failure) {
    error.value = errorMessageFrom(failure) ?? t('settings.pages.card.sync.failed')
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div
    v-if="catalog.currentRecord && (hasPending || conflicts?.length || catalog.syncError || error)"
    :class="['flex flex-col gap-3 rounded-xl bg-neutral-100 p-4 text-sm dark:bg-neutral-800']"
    aria-live="polite"
  >
    <p v-if="hasPending">
      {{ t('settings.pages.card.sync.pending') }}
    </p>
    <div v-for="id in conflicts" :key="id" :class="['flex flex-col gap-2']">
      <p>{{ t('settings.pages.card.sync.conflict', { name: catalog.cards.get(id)?.name }) }}</p>
      <div :class="['flex flex-wrap gap-2']">
        <Button :label="t('settings.pages.card.sync.keep-local')" :disabled="pending" @click="synchronize(id, 'local')" />
        <Button :label="t('settings.pages.card.sync.use-cloud')" :disabled="pending" @click="synchronize(id, 'remote')" />
      </div>
    </div>
    <p v-if="error || catalog.syncError" role="alert" :class="['text-red-600 dark:text-red-400']">
      {{ error || catalog.syncError }}
    </p>
    <Button :label="t('settings.pages.card.sync.retry')" :loading="pending" @click="synchronize()" />
  </div>
</template>
