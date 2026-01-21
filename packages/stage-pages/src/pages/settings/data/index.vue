<script setup lang="ts">
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { useDataMaintenance } from '@proj-airi/stage-ui/composables/use-data-maintenance'
import { Button, DoubleCheckButton } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const {
  deleteAllModels,
  resetProvidersSettings,
  resetModulesSettings,
  deleteAllChatSessions,
  exportChatSessions,
  importChatSessions,
  deleteAllData,
  resetDesktopApplicationState,
} = useDataMaintenance()

const statusMessage = ref('')
const statusTone = ref<'neutral' | 'success' | 'error'>('neutral')
const importError = ref('')
const importFileInput = ref<HTMLInputElement>()
const isDesktop = computed(() => isStageTamagotchi())

function setStatus(message: string, tone: 'neutral' | 'success' | 'error' = 'success') {
  statusMessage.value = message
  statusTone.value = tone
}

async function runAction(action: () => Promise<void> | void, successKey: string) {
  try {
    await action()
    setStatus(t(successKey), 'success')
  }
  catch (error) {
    console.error(error)
    setStatus(error instanceof Error ? error.message : String(error), 'error')
  }
}

function triggerExport() {
  try {
    const blob = exportChatSessions()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `airi-chat-sessions-${new Date().toISOString()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setStatus(t('settings.pages.data.status.exported'))
  }
  catch (error) {
    console.error(error)
    setStatus(error instanceof Error ? error.message : String(error), 'error')
  }
}

function triggerImportPicker() {
  importError.value = ''
  importFileInput.value?.click()
}

async function handleImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file)
    return

  try {
    const raw = await file.text()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    importChatSessions(parsed)
    setStatus(t('settings.pages.data.status.imported'))
    importError.value = ''
  }
  catch (error) {
    console.error(error)
    importError.value = t('settings.pages.data.status.import_error')
    setStatus(error instanceof Error ? error.message : String(error), 'error')
  }
  finally {
    target.value = ''
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="border-2 border-neutral-200/50 rounded-xl bg-white/70 p-4 shadow-sm dark:border-neutral-800/60 dark:bg-neutral-900/60">
      <div class="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div class="flex flex-col gap-1 md:max-w-[560px]">
          <div class="text-lg font-medium">
            {{ t('settings.pages.data.sections.chats.title') }}
          </div>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            {{ t('settings.pages.data.sections.chats.description') }}
          </p>
        </div>
        <div class="flex flex-col items-start gap-2 sm:items-end">
          <div class="flex flex-wrap gap-2">
            <Button variant="secondary" @click="triggerExport">
              {{ t('settings.pages.data.sections.chats.export') }}
            </Button>
            <Button variant="primary" @click="triggerImportPicker">
              {{ t('settings.pages.data.sections.chats.import') }}
            </Button>
          </div>
          <DoubleCheckButton
            variant="danger"
            @confirm="runAction(deleteAllChatSessions, 'settings.pages.data.status.chats_deleted')"
          >
            {{ t('settings.pages.data.sections.chats.delete') }}
            <template #confirm>
              {{ t('settings.pages.data.confirmations.yes') }}
            </template>
            <template #cancel>
              {{ t('settings.pages.card.cancel') }}
            </template>
          </DoubleCheckButton>
        </div>
      </div>
      <input ref="importFileInput" type="file" accept="application/json" class="hidden" @change="handleImport">
      <p v-if="importError" class="text-sm text-red-500">
        {{ importError }}
      </p>
    </div>

    <div class="border-2 border-neutral-200/50 rounded-xl bg-white/70 p-4 shadow-sm dark:border-neutral-800/60 dark:bg-neutral-900/60">
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div class="flex flex-col gap-1 md:max-w-[560px]">
            <div class="text-lg font-medium">
              {{ t('settings.pages.data.sections.models.title') }}
            </div>
            <p class="text-sm text-neutral-600 dark:text-neutral-400">
              {{ t('settings.pages.data.sections.models.description') }}
            </p>
          </div>
          <div class="flex flex-col items-start gap-2">
            <DoubleCheckButton
              variant="danger"
              @confirm="runAction(deleteAllModels, 'settings.pages.data.status.models_deleted')"
            >
              {{ t('settings.pages.data.sections.models.delete') }}
              <template #confirm>
                {{ t('settings.pages.data.confirmations.yes') }}
              </template>
              <template #cancel>
                {{ t('settings.pages.card.cancel') }}
              </template>
            </DoubleCheckButton>
          </div>
        </div>

        <div class="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div class="flex flex-col gap-1 md:max-w-[560px]">
            <div class="text-lg font-medium">
              {{ t('settings.pages.data.sections.modules.title') }}
            </div>
            <p class="text-sm text-neutral-600 dark:text-neutral-400">
              {{ t('settings.pages.data.sections.modules.description') }}
            </p>
          </div>
          <div class="flex flex-col items-start gap-2">
            <DoubleCheckButton
              variant="caution"
              @confirm="runAction(resetModulesSettings, 'settings.pages.data.status.modules_reset')"
            >
              {{ t('settings.pages.data.sections.modules.reset') }}
              <template #confirm>
                {{ t('settings.pages.data.confirmations.yes') }}
              </template>
              <template #cancel>
                {{ t('settings.pages.card.cancel') }}
              </template>
            </DoubleCheckButton>
          </div>
        </div>
      </div>
    </div>

    <div class="border-2 border-neutral-200/50 rounded-xl bg-white/70 p-4 shadow-sm dark:border-neutral-800/60 dark:bg-neutral-900/60">
      <div class="flex flex-col gap-3">
        <div>
          <div class="text-lg text-red-600 font-semibold dark:text-red-300">
            {{ t('settings.pages.data.sections.danger.title') }}
          </div>
          <p class="text-sm text-red-600/80 dark:text-red-200/80">
            {{ t('settings.pages.data.sections.danger.description') }}
          </p>
        </div>

        <div class="flex flex-col gap-3">
          <div class="grid gap-3 md:grid-cols-2">
            <div class="rounded-lg bg-white/70 p-3 dark:bg-red-950/40">
              <div class="grid grid-cols-1 items-start gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <div class="flex flex-col gap-1 md:max-w-[560px]">
                  <div class="text-sm text-red-700 font-medium dark:text-red-200">
                    {{ t('settings.pages.data.sections.providers.title') }}
                  </div>
                  <p class="text-xs text-red-700/80 dark:text-red-200/80">
                    {{ t('settings.pages.data.sections.providers.description') }}
                  </p>
                </div>
                <div class="flex flex-col items-start gap-2">
                  <DoubleCheckButton
                    variant="danger"
                    @confirm="runAction(resetProvidersSettings, 'settings.pages.data.status.providers_reset')"
                  >
                    {{ t('settings.pages.data.sections.providers.reset') }}
                    <template #confirm>
                      {{ t('settings.pages.data.confirmations.yes') }}
                    </template>
                    <template #cancel>
                      {{ t('settings.pages.card.cancel') }}
                    </template>
                  </DoubleCheckButton>
                </div>
              </div>
            </div>

            <div class="rounded-lg bg-white/70 p-3 dark:bg-red-950/40">
              <div class="grid grid-cols-1 items-start gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <div class="flex flex-col gap-1 md:max-w-[560px]">
                  <div class="text-sm text-red-700 font-medium dark:text-red-200">
                    {{ t('settings.pages.data.sections.all.title') }}
                  </div>
                  <p class="text-xs text-red-700/80 dark:text-red-200/80">
                    {{ t('settings.pages.data.sections.all.description') }}
                  </p>
                </div>
                <div class="flex flex-col items-start gap-2">
                  <DoubleCheckButton
                    variant="danger"
                    @confirm="runAction(deleteAllData, 'settings.pages.data.status.all_deleted')"
                  >
                    {{ t('settings.pages.data.sections.all.delete') }}
                    <template #confirm>
                      {{ t('settings.pages.data.confirmations.yes') }}
                    </template>
                    <template #cancel>
                      {{ t('settings.pages.card.cancel') }}
                    </template>
                  </DoubleCheckButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="isDesktop"
      class="border-2 border-amber-300/80 rounded-xl bg-amber-50/80 p-4 shadow-sm dark:border-amber-500/60 dark:bg-amber-500/10"
    >
      <div class="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div class="flex flex-col gap-1 md:max-w-[560px]">
          <div class="text-lg text-amber-700 font-medium dark:text-amber-200">
            {{ t('settings.pages.data.sections.desktop.title') }}
          </div>
          <p class="text-sm text-amber-700/80 dark:text-amber-200/80">
            {{ t('settings.pages.data.sections.desktop.description') }}
          </p>
        </div>
        <div class="flex flex-col items-start gap-2">
          <DoubleCheckButton
            variant="caution"
            @confirm="runAction(resetDesktopApplicationState, 'settings.pages.data.status.desktop_reset')"
          >
            {{ t('settings.pages.data.sections.desktop.reset') }}
            <template #confirm>
              {{ t('settings.pages.data.confirmations.yes') }}
            </template>
            <template #cancel>
              {{ t('settings.pages.card.cancel') }}
            </template>
          </DoubleCheckButton>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.data.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.data.description
  icon: i-solar:database-bold-duotone
  settingsEntry: true
  order: 7
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
