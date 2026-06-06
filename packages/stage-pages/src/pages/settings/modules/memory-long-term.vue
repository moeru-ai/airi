<script setup lang="ts">
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useAlayaMemoryStore } from '@proj-airi/stage-ui/stores/modules/alaya-memory'
import { Button } from '@proj-airi/ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const alaya = useAlayaMemoryStore()
const airiCard = useAiriCardStore()

const activeCharacterId = computed(() => airiCard.activeCardId)

watch(activeCharacterId, (id) => {
  if (id)
    alaya.connect({ characterId: id })
}, { immediate: true })

const memoryCount = computed(() => alaya.totalCount)
const isRunningHousekeeping = ref(false)

async function handleHousekeeping() {
  isRunningHousekeeping.value = true
  try { await alaya.runHousekeeping() }
  finally { isRunningHousekeeping.value = false }
}

const recentMemories = computed(() =>
  alaya.allMemories.slice(-5).reverse(),
)

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div flex="~ col gap-6" pb-12>
    <!-- Status card -->
    <div
      v-if="activeCharacterId"
      bg="white/60 dark:neutral-800/60"
      border="1 solid neutral-200/30 dark:neutral-700/30"
      rounded-xl p-5 backdrop-blur-md
      flex="~ col gap-3"
    >
      <div flex="~" items-center gap-2>
        <div i-solar:leaf-bold-duotone text="xl primary-500" />
        <h2 text="base font-semibold">
          {{ t('settings.pages.modules.memory-long-term.title') }}
        </h2>
      </div>

      <div flex="~" items-center gap-6 text="sm">
        <div flex="~ col">
          <span text="xs neutral-400">{{ t('settings.pages.memory.totalMemories') }}</span>
          <span text="2xl font-semibold">{{ memoryCount }}</span>
        </div>
        <div flex-1 />
        <Button
          variant="secondary"
          size="sm"
          :label="t('settings.pages.memory.runHousekeeping')"
          :loading="isRunningHousekeeping"
          @click="handleHousekeeping()"
        />
      </div>
    </div>

    <div v-else flex="~ col" items-center justify-center gap-2 py-16>
      <div i-solar:leaf-bold-duotone text="4 neutral-400/20" />
      <p text="sm neutral-400">
        {{ t('settings.pages.memory.noCharacter') }}
      </p>
    </div>

    <!-- Recent memories -->
    <div v-if="recentMemories.length > 0" flex="~ col gap-2">
      <p text="xs neutral-400 font-medium uppercase tracking-wide px-1">
        {{ t('settings.pages.memory.recentMemories') }}
      </p>
      <div
        v-for="entry in recentMemories"
        :key="entry.id"
        bg="white/40 dark:neutral-800/40"

        flex="~" items-start gap-3 rounded-lg p-3
      >
        <div i-solar:chat-dots-bold-duotone text="neutral-400" mt-0.5 />
        <div min-w-0 flex-1>
          <p text="sm" line-clamp-2>
            {{ entry.summary || entry.content }}
          </p>
          <p text="xs neutral-400 mt-1">
            {{ formatDate(entry.createdAt) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Management link -->
    <div v-if="activeCharacterId" flex="~" items-center justify-end>
      <router-link to="/settings/memory">
        <Button
          variant="secondary"
          size="sm"
          icon="i-solar:list-bold-duotone"
          :label="t('settings.pages.memory.manageMemories')"
        />
      </router-link>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-long-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
