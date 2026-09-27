<script setup lang="ts">
import { AiriCardPackageError, importAiriCardPackage } from '@proj-airi/stage-ui/services/airi-card-import-export'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button, Input, InputFileCard } from '@proj-airi/ui'
import { ComboboxSelect } from '@proj-airi/ui/components/form'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import CardListItem from './components/CardListItem.vue'

const { t } = useI18n()
const cards = useAiriCardStore()
const displayModels = useDisplayModelsStore()
const route = useRoute()
const router = useRouter()
const searchQuery = shallowRef('')
const sortOption = shallowRef<'nameAsc' | 'nameDesc' | 'recent'>('nameAsc')
const showImport = shallowRef(false)
const inputFiles = ref<File[]>([])

onMounted(async () => {
  await cards.initialize()
  if (!displayModels.displayModels.length)
    await displayModels.loadDisplayModelsFromIndexedDB()
})

const visibleCards = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const entries = [...cards.cards.entries()].filter(([, card]) => card.name.toLowerCase().includes(query) || card.description?.toLowerCase().includes(query))
  if (sortOption.value === 'recent')
    return entries.reverse()
  return entries.sort(([, first], [, second]) => sortOption.value === 'nameAsc' ? first.name.localeCompare(second.name) : second.name.localeCompare(first.name))
})

watch(inputFiles, async (files) => {
  const file = files[0]
  if (!file)
    return
  try {
    await cards.addCard(await importAiriCardPackage({ file, displayModelsStore: displayModels }), 'import')
    toast(t('settings.pages.card.imported'))
    showImport.value = false
  }
  catch (error) {
    console.error('Error processing card package:', error)
    toast(t(error instanceof AiriCardPackageError && error.code === 'missing-file'
      ? 'settings.pages.card.import_missing_file'
      : 'settings.pages.card.import_invalid_file'))
  }
  finally {
    inputFiles.value = []
  }
})

watch(() => [route.query.cardId, route.query.tab], ([cardId, tab]) => {
  if (typeof cardId !== 'string')
    return
  const section = typeof tab === 'string' ? tab : ''
  const edit = ['identity', 'behavior', 'model', 'modules', 'artistry', 'settings'].includes(section)
  void router.replace({
    path: `/settings/airi-card/${encodeURIComponent(cardId)}${edit ? '/edit' : ''}`,
    query: edit ? { section } : { tab: section },
  })
}, { immediate: true })
</script>

<template>
  <div :class="['mx-auto max-w-7xl flex flex-col gap-6 p-4']">
    <div :class="['flex flex-wrap items-center justify-between gap-4']">
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.card.library-description') }}
      </p>
      <div :class="['flex items-center gap-2']">
        <Button icon="i-solar:upload-square-linear" :label="t('settings.pages.card.upload')" :aria-expanded="showImport" @click="showImport = !showImport" />
        <Button icon="i-solar:add-circle-linear" color="primary" :label="t('settings.pages.card.create_card')" @click="router.push('/settings/airi-card/new')" />
      </div>
    </div>
    <InputFileCard v-if="showImport" v-model="inputFiles" accept=".zip">
      <template #default="{ isDragging }">
        <span :class="['text-sm text-neutral-500 dark:text-neutral-400']">{{ t(isDragging ? 'settings.pages.card.drop_here' : 'settings.pages.card.upload_desc') }}</span>
      </template>
    </InputFileCard>
    <div :class="['flex flex-wrap items-center gap-3']">
      <Input
        v-model="searchQuery"
        type="search"
        :aria-label="t('settings.pages.card.search')"
        :placeholder="t('settings.pages.card.search')"
        :class="['min-w-40 flex-1 rounded-xl px-4 py-2.5']"
      />
      <ComboboxSelect
        v-model="sortOption"
        :options="[
          { value: 'nameAsc', label: t('settings.pages.card.name_asc') },
          { value: 'nameDesc', label: t('settings.pages.card.name_desc') },
          { value: 'recent', label: t('settings.pages.card.recent') },
        ]"
        :placeholder="t('settings.pages.card.sort_by')"
        :class="['w-40']"
      />
    </div>
    <div :class="['grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4']">
      <CardListItem
        v-for="[id, card] in visibleCards"
        :id="id"
        :key="id"
        :name="card.name"
        :description="card.description"
        :is-active="id === cards.activeCardId"
        :version="card.version"
        :model-id="card.extensions.airi.modules.displayModelId"
      />
    </div>
    <p v-if="!visibleCards.length" :class="['py-12 text-center text-neutral-500 dark:text-neutral-400']">
      {{ t(searchQuery ? 'settings.pages.card.no_results' : 'settings.pages.card.no_cards') }}
    </p>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.card.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.card.description
  icon: i-solar:emoji-funny-square-bold-duotone
  settingsEntry: true
  order: 1
  stageTransition:
    name: slide
</route>
