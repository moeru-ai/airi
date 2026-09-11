<script setup lang="ts">
import { Avatar, BasicButton, BottomDrawer, GhostButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useDisplayModelsStore } from '../../stores/display-models'
import { useAiriCardStore } from '../../stores/modules/airi-card'

const { t } = useI18n()
const router = useRouter()
const cardStore = useAiriCardStore()
const { cards, activeCard, activeCardId } = storeToRefs(cardStore)
const { displayModels } = storeToRefs(useDisplayModelsStore())
const open = shallowRef(false)
const switching = shallowRef(false)
const failed = shallowRef(false)
const manageAfterClose = shallowRef(false)
const entries = computed(() => Array.from(cards.value, ([id, card]) => ({
  id,
  name: card.name,
  preview: displayModels.value.find(model => model.id === card.extensions.airi.modules.displayModelId)?.previewImage,
})))

async function selectCharacter(id: string) {
  if (switching.value)
    return
  if (id === activeCardId.value) {
    open.value = false
    return
  }
  switching.value = true
  failed.value = false
  try {
    if (await cardStore.activateCard(id))
      open.value = false
    else
      failed.value = true
  }
  catch {
    failed.value = true
  }
  finally {
    switching.value = false
  }
}

function manageCharacters() {
  // Let the drawer release its focus and scroll locks before changing routes.
  manageAfterClose.value = true
  open.value = false
}

function finishClose() {
  failed.value = false
  if (manageAfterClose.value) {
    manageAfterClose.value = false
    void router.push('/settings/airi-card')
  }
}
</script>

<template>
  <div :class="['min-w-0 flex flex-1 justify-center px-2']">
    <BottomDrawer
      v-model="open"
      :title="t('stage.character-switcher.title')"
      minimum-height="half"
      @after-close="finishClose"
      @close-auto-focus="event => { if (manageAfterClose) event.preventDefault() }"
    >
      <template #trigger>
        <BasicButton
          size="unset"
          data-testid="character-selector-button"
          :aria-label="`${t('stage.character-switcher.title')}: ${activeCard?.name ?? t('stage.character-switcher.empty')}`"
          :title="activeCard?.name"
          :class="[
            'pointer-events-auto h-11 min-w-0 max-w-full rounded-full px-3',
            'text-neutral-700 dark:text-neutral-200',
            'focus-visible:outline-2 focus-visible:outline-primary-500',
            '[&_.basic-button-content]:min-w-0',
          ]"
        >
          <span :class="['truncate text-base font-semibold']">{{ activeCard?.name ?? t('stage.character-switcher.empty') }}</span>
          <span aria-hidden="true" :class="['i-solar:alt-arrow-down-outline size-4 shrink-0']" />
        </BasicButton>
      </template>
      <div :class="['grid grid-cols-2 gap-3']">
        <BasicButton
          v-for="entry in entries"
          :key="entry.id"
          size="unset"
          :aria-pressed="entry.id === activeCardId"
          :aria-label="entry.name"
          :disabled="switching"
          :class="[
            'relative min-w-0 rounded-2xl border border-solid p-2',
            '[&_.basic-button-content]:w-full [&_.basic-button-content]:min-w-0 [&_.basic-button-content]:flex-col',
            'focus-visible:outline-2 focus-visible:outline-primary-500',
            entry.id === activeCardId ? 'border-primary-500 bg-primary-50 dark:bg-primary-950' : 'border-neutral-200 dark:border-neutral-700',
          ]"
          @click="selectCharacter(entry.id)"
        >
          <Avatar :src="entry.preview" :class="['aspect-[4/3] w-full rounded-xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800']">
            <template #fallback>
              <span aria-hidden="true" :class="['i-solar:user-rounded-outline size-10']" />
            </template>
          </Avatar>
          <span :class="['w-full truncate text-sm']" :title="entry.name">{{ entry.name }}</span>
          <span v-if="entry.id === activeCardId" aria-hidden="true" :class="['i-solar:check-circle-bold absolute right-3 top-3 size-6 text-primary-500']" />
        </BasicButton>
      </div>
      <p v-if="!entries.length" :class="['py-8 text-center text-neutral-500']">
        {{ t('stage.character-switcher.empty') }}
      </p>
      <p v-if="failed" role="alert" :class="['mt-3 text-sm text-red-600 dark:text-red-400']">
        {{ t('stage.character-switcher.failed') }}
      </p>
      <GhostButton
        block size="unset" :disabled="switching"
        :class="['mt-4 min-h-11 rounded-xl px-3 [&_.basic-button-content]:w-full']"
        @click="manageCharacters"
      >
        <span aria-hidden="true" :class="['i-solar:users-group-rounded-outline size-5 shrink-0']" />
        <span :class="['flex-1 text-left']">{{ t('stage.character-switcher.manage') }}</span>
        <span aria-hidden="true" :class="['i-solar:alt-arrow-right-outline size-4']" />
      </GhostButton>
    </BottomDrawer>
  </div>
</template>
