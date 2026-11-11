<script setup lang="ts">
import { useHostAutoUpdater } from '@proj-airi/stage-host-context'
import { AboutContent } from '@proj-airi/stage-ui/components'
import { useBuildInfo } from '@proj-airi/stage-ui/composables'
import { Button } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const buildInfo = useBuildInfo()
const { t } = useI18n()

const {
  state: updateState,
  isBusy,
  checkForUpdates,
} = useHostAutoUpdater()

const isDisabled = computed(() => updateState.value.status === 'disabled')
const isStoreManaged = import.meta.env.VITE_DISTRIBUTION === 'steam'
</script>

<template>
  <div
    :class="[
      'min-h-100dvh',
      'min-w-100dvw',
      'bg-neutral-50/80',
      'text-neutral-800',
      'dark:bg-neutral-900',
      'dark:text-neutral-100',
    ]"
  >
    <div :class="['mx-auto max-w-[min(960px,calc(100%-2rem))]', 'p-6']">
      <AboutContent
        title="Project"
        highlight="AIRI"
        :subtitle="t('tamagotchi.stage.about.subtitle')"
      >
        <template #before-build-info>
          <div
            :class="[
              'rounded-2xl', 'flex', 'flex-col', 'gap-6',
              'p-4',
              'rounded-xl',
              'bg-neutral-200/80 dark:bg-neutral-800',
              'backdrop-blur-sm',
            ]"
          >
            <div :class="['flex flex-wrap items-center justify-between gap-4']">
              <div>
                <div :class="['text-sm text-neutral-500 dark:text-neutral-400']">
                  {{ t('tamagotchi.stage.about.current-version') }}
                </div>
                <div :class="['text-xl font-medium font-mono']">
                  {{ buildInfo.version }}
                </div>
              </div>
              <div :class="['text-right text-xs text-neutral-400 dark:text-neutral-500']">
                <div>{{ buildInfo.branch }}@{{ buildInfo.commit }}</div>
                <div>{{ buildInfo.builtOn }}</div>
              </div>
            </div>

            <div :class="['flex flex-wrap gap-2']">
              <Button
                v-track-button="{ name: 'update_check_clicked', channel: 'auto' }"
                color="neutral"
                variant="secondary"
                :loading="isBusy"
                :disabled="isDisabled"
                :icon="isDisabled ? 'i-solar:forbidden-circle-outline' : 'i-solar:refresh-outline'"
                :label="isBusy
                  ? t('tamagotchi.stage.about.update.actions.checking')
                  : isDisabled
                    ? t(isStoreManaged
                      ? 'tamagotchi.stage.about.update.actions.managed-by-store'
                      : 'tamagotchi.stage.about.update.actions.disabled-dev')
                    : t('tamagotchi.stage.about.update.actions.check-for-updates')"
                @click="checkForUpdates()"
              />
            </div>
          </div>
        </template>
      </AboutContent>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
