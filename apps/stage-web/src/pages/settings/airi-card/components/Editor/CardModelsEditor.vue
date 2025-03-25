<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores'

import { Collapsable } from '@proj-airi/stage-ui/components'
import { useConsciousnessStore, useSpeechStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

interface Props {
  card: AiriCard
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'sync-models'): void
}>()

const { t } = useI18n()
const consciousnessStore = useConsciousnessStore()
const {
  activeProvider,
  activeModel,
} = storeToRefs(consciousnessStore)
const speechStore = useSpeechStore()
const {
  activeSpeechProvider,
  activeSpeechVoice,
  activeSpeechVoiceId,
} = storeToRefs(speechStore)

function handleSync() {
  emit('syncModels')
}
</script>

<template>
  <Collapsable>
    <template #trigger="slotProps">
      <button
        bg="zinc-100 dark:zinc-800"
        hover="bg-zinc-200 dark:bg-zinc-700"
        transition="all ease-in-out duration-250"
        w-full flex items-center gap-1.5 rounded-lg px-4 py-3 outline-none
        class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
        @click="slotProps.setVisible(!slotProps.visible)"
      >
        <div flex="~ row 1" items-center gap-1.5>
          <div
            i-solar:face-scan-circle-bold-duotone class="provider-icon size-6"
            transition="filter duration-250 ease-in-out"
          />
          <div>
            {{ t('settings.pages.card.models') }}
          </div>
        </div>
        <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
          <div i-solar:alt-arrow-down-bold-duotone />
        </div>
      </button>
    </template>

    <div flex="~ col" gap-5 p-4>
      <div flex="~ row" items-center justify-between>
        <div>
          <h4 text-sm font-medium text="neutral-700 dark:neutral-300">
            {{ t('settings.pages.card.model_settings') }}
          </h4>
          <p text="xs neutral-500" mt-1>
            Select the model and voice for this card
          </p>
        </div>
        <div flex="~ row" items-center gap-2>
          <RouterLink
            to="/settings/providers"
            bg="primary-100 dark:primary-900/30"
            hover="bg-primary-200 dark:primary-900/50"
            class="primary-600 dark:primary-400"
            flex="~ row" items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition
            :text="t('settings.pages.providers.title')"
          >
            <div i-solar:settings-linear text-sm />
          </RouterLink>

          <button
            bg="neutral-100 dark:neutral-800"
            hover="bg-neutral-200 dark:neutral-700"
            flex="~ row" items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition
            @click="handleSync"
          >
            <div i-solar:refresh-circle-linear text-sm />
            {{ t('common.sync') }}
          </button>
        </div>
      </div>

      <div grid="~ cols-1 md:cols-2" gap-5>
        <!-- Consciousness Model Card -->
        <div
          bg="neutral-50 dark:neutral-800"
          border="~ neutral-200 dark:neutral-700"
          rounded-xl p-4
        >
          <div flex="~ col" gap-3>
            <div flex="~ row" mb-1 items-center justify-between>
              <div flex="~ row" items-center gap-1.5>
                <div i-solar:brain-bold text="primary-500" text-base />
                <h5 text-sm font-medium>
                  {{ t('settings.pages.card.consciousness_model') }}
                </h5>
              </div>

              <RouterLink
                to="/settings/consciousness"
                class="primary-600 dark:primary-400 text-xs"
                hover="underline"
                flex="~ row" items-center gap-1
                :text="t('settings.pages.modules.consciousness.title')"
              >
                <div i-solar:settings-minimalistic-linear text-xs />
              </RouterLink>
            </div>

            <!-- Provider & Model -->
            <div
              bg="white dark:neutral-700/50"
              border="~ neutral-200 dark:neutral-600"
              rounded-lg p-3
            >
              <div flex="~ col" gap-3>
                <!-- Provider -->
                <div>
                  <div text="xs neutral-500" mb-1>
                    {{ t('settings.pages.providers.title') }}
                  </div>
                  <div
                    bg="white dark:neutral-700"
                    border="~ neutral-200 dark:neutral-600"
                    rounded-md px-3 py-2
                    text="sm"
                    font-medium
                  >
                    {{ activeProvider }}
                  </div>
                </div>

                <!-- Model -->
                <div>
                  <div text="xs neutral-500" mb-1>
                    {{ t('common.model') }}
                  </div>
                  <div
                    bg="white dark:neutral-700"
                    border="~ neutral-200 dark:neutral-600"
                    rounded-md px-3 py-2
                    text="sm"
                    font-medium
                  >
                    {{ card.models?.consciousness ?? activeModel }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Voice Model Card -->
        <div
          bg="neutral-50 dark:neutral-800"
          border="~ neutral-200 dark:neutral-700"
          rounded-xl p-4
        >
          <div flex="~ col" gap-3>
            <div flex="~ row" mb-1 items-center justify-between>
              <div flex="~ row" items-center gap-1.5>
                <div i-solar:microphone-bold text="primary-500" text-base />
                <h5 text-sm font-medium>
                  {{ t('settings.pages.card.voice_model') }}
                </h5>
              </div>
              <RouterLink
                to="/settings/speech"
                class="primary-600 dark:primary-400 text-xs"
                hover="underline"
                flex="~ row" items-center gap-1
                :text="t('settings.pages.modules.speech.title')"
              >
                <div i-solar:settings-minimalistic-linear text-xs />
              </RouterLink>
            </div>

            <!-- Provider & Voice settings -->
            <div
              bg="white dark:neutral-700/50"
              border="~ neutral-200 dark:neutral-600"
              rounded-lg p-3
            >
              <div flex="~ col" gap-3>
                <!-- Provider -->
                <div>
                  <div text="xs neutral-500" mb-1>
                    {{ t('settings.pages.providers.title') }}
                  </div>
                  <div
                    bg="white dark:neutral-700"
                    border="~ neutral-200 dark:neutral-600"
                    rounded-md px-3 py-2
                    text="sm"
                    font-medium
                  >
                    {{ activeSpeechProvider }}
                  </div>
                </div>

                <!-- Voice -->
                <div>
                  <div text="xs neutral-500" mb-1>
                    {{ t('settings.voices') }}
                  </div>
                  <div
                    bg="white dark:neutral-700"
                    border="~ neutral-200 dark:neutral-600"
                    rounded-md px-3 py-2
                    text="sm"
                    font-medium
                  >
                    {{ activeSpeechVoice }}
                    <span text="xs neutral-400" ml-1>
                      ({{ card.models?.voice ?? activeSpeechVoiceId }})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Collapsable>
</template>
