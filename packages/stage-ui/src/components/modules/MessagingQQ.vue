<script setup lang="ts">
import type { QQMemeImageConfig } from '../../stores/modules/qq'

import { Button, Collapsible, FieldCheckbox, FieldInput, Radio, Select } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import Section from '../layouts/section.vue'

import { useQQStore } from '../../stores/modules/qq'

const { t } = useI18n()
const qqStore = useQQStore()
const {
  enabled,
  method,
  officialAppId,
  officialAppSecret,
  napcatWsUrl,
  napcatWsToken,
  napcatHttpApiUrl,
  napcatHttpApiToken,
  napcatGroupOnlyReplyAt,
  voiceReplyMode,
  aiGirlfriendEnabled,
  memeProbability,
  syncMemePacksAcrossModules,
  emotionMemePacks,
  boundUserIds,
  clearingBoundUserIds,
  ttsConfigured,
  voiceGenerationStatus,
  voiceGenerationLastMessage,
  configured,
  connectionStatus,
  connectionMessage,
  connectionError,
} = storeToRefs(qqStore)

const voiceSettingsSaving = ref(false)

const connectionMethods = computed(() => [
  { value: 'official', label: t('settings.pages.modules.messaging-qq.methods.official') },
  { value: 'napcat', label: t('settings.pages.modules.messaging-qq.methods.napcat') },
])

const canAutoPushVoiceSettings = computed(() => {
  return enabled.value
    && officialAppId.value.trim().length > 0
    && officialAppSecret.value.trim().length > 0
})

const hasBoundUserIds = computed(() => boundUserIds.value.length > 0)
const activeEmotionMemePackIndex = shallowRef(0)
const expandMemePreview = shallowRef(true)
const activeEmotionMemePack = computed(() => {
  const packs = emotionMemePacks.value
  if (packs.length === 0)
    return null

  const index = Math.max(0, Math.min(activeEmotionMemePackIndex.value, packs.length - 1))
  return packs[index] ?? null
})

const boundDrawerLabel = computed(() => {
  return t('settings.pages.modules.messaging-qq.bound-account-drawer-label', {
    count: boundUserIds.value.length,
  })
})

async function saveSettings() {
  await qqStore.saveSettings()
}

function addEmotionMemePack() {
  qqStore.addEmotionMemePack()
  activeEmotionMemePackIndex.value = emotionMemePacks.value.length - 1
}

function removeEmotionMemePack(index: number) {
  qqStore.removeEmotionMemePack(index)
}

function removeActiveEmotionMemePack() {
  if (!activeEmotionMemePack.value)
    return

  removeEmotionMemePack(activeEmotionMemePackIndex.value)
}

function updateEmotionState(index: number, value: string) {
  qqStore.updateEmotionMemePackState(index, value)
}

function updateActiveEmotionState(value: string) {
  if (!activeEmotionMemePack.value)
    return

  updateEmotionState(activeEmotionMemePackIndex.value, value)
}

function removeEmotionImage(index: number, imageId: string) {
  qqStore.removeEmotionMemeImage(index, imageId)
}

function removeActiveEmotionImage(imageId: string) {
  if (!activeEmotionMemePack.value)
    return

  removeEmotionImage(activeEmotionMemePackIndex.value, imageId)
}

function setActiveEmotionMemePack(index: number) {
  const maxIndex = emotionMemePacks.value.length - 1
  if (maxIndex < 0) {
    activeEmotionMemePackIndex.value = 0
    expandMemePreview.value = true
    return
  }

  activeEmotionMemePackIndex.value = Math.max(0, Math.min(index, maxIndex))
  expandMemePreview.value = true
}

async function clearBoundUserIds() {
  try {
    await qqStore.clearBoundUserIdsForCurrentMethod()
    toast.success(t('settings.pages.modules.messaging-qq.clear-bound-userids-success'))
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('settings.pages.modules.messaging-qq.clear-bound-userids-failed'))
  }
}

function buildPreviewSrc(image: QQMemeImageConfig) {
  return `data:${image.mimeType};base64,${image.dataBase64}`
}

function getMemeUploadInputId(index: number) {
  return `qq-meme-upload-${index}`
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function handleMemeFileChange(index: number, event: Event) {
  const input = event.target as HTMLInputElement | null
  const files = input?.files ? Array.from(input.files) : []
  if (files.length === 0)
    return

  try {
    const images = await Promise.all(files.map(async (file): Promise<QQMemeImageConfig> => {
      const buffer = await file.arrayBuffer()
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType: file.type || 'image/png',
        dataBase64: arrayBufferToBase64(buffer),
      }
    }))

    qqStore.appendEmotionMemeImages(index, images)
    toast.success(t('settings.pages.modules.messaging-qq.meme-upload-success', {
      count: images.length,
    }))
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('settings.pages.modules.messaging-qq.meme-upload-failed'))
  }
  finally {
    if (input)
      input.value = ''
  }
}

async function handleActiveMemeFileChange(event: Event) {
  if (!activeEmotionMemePack.value)
    return

  await handleMemeFileChange(activeEmotionMemePackIndex.value, event)
}

watch(voiceReplyMode, async (next, prev) => {
  if (next === prev)
    return

  voiceSettingsSaving.value = true
  try {
    if (canAutoPushVoiceSettings.value)
      await qqStore.saveSettings()
    toast.success(t('settings.pages.modules.messaging-qq.voice-settings-saved'))
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('settings.pages.modules.messaging-qq.voice-settings-save-failed'))
  }
  finally {
    voiceSettingsSaving.value = false
  }
})

watch(emotionMemePacks, (packs) => {
  if (packs.length === 0) {
    activeEmotionMemePackIndex.value = 0
    expandMemePreview.value = true
    return
  }

  if (activeEmotionMemePackIndex.value >= packs.length) {
    activeEmotionMemePackIndex.value = packs.length - 1
  }
}, { immediate: true })
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <Section
      :title="t('settings.pages.modules.messaging-qq.section-connection-title')"
      :description="t('settings.pages.modules.messaging-qq.section-connection-description')"
      icon="i-solar:network-bold-duotone"
    >
      <div :class="['grid gap-4']">
        <FieldCheckbox
          v-model="enabled"
          :label="t('settings.pages.modules.messaging-qq.enable')"
          :description="t('settings.pages.modules.messaging-qq.enable-description')"
        />

        <Select
          v-model="method"
          :label="t('settings.pages.modules.messaging-qq.method')"
          :description="t('settings.pages.modules.messaging-qq.method-description')"
          :options="connectionMethods"
        />

        <template v-if="method === 'official'">
          <FieldInput
            v-model="officialAppId"
            :label="t('settings.pages.modules.messaging-qq.official-app-id')"
            :description="t('settings.pages.modules.messaging-qq.official-app-id-description')"
            :placeholder="t('settings.pages.modules.messaging-qq.official-app-id-placeholder')"
          />

          <FieldInput
            v-model="officialAppSecret"
            type="password"
            :label="t('settings.pages.modules.messaging-qq.official-app-secret')"
            :description="t('settings.pages.modules.messaging-qq.official-app-secret-description')"
            :placeholder="t('settings.pages.modules.messaging-qq.official-app-secret-placeholder')"
          />
        </template>

        <template v-else>
          <FieldInput
            v-model="napcatWsUrl"
            :label="t('settings.pages.modules.messaging-qq.napcat-ws-url')"
            :description="t('settings.pages.modules.messaging-qq.napcat-ws-url-description')"
            :placeholder="t('settings.pages.modules.messaging-qq.napcat-ws-url-placeholder')"
          />

          <FieldInput
            v-model="napcatWsToken"
            type="password"
            :label="t('settings.pages.modules.messaging-qq.napcat-ws-token')"
            :description="t('settings.pages.modules.messaging-qq.napcat-ws-token-description')"
            :placeholder="t('settings.pages.modules.messaging-qq.napcat-ws-token-placeholder')"
          />

          <FieldInput
            v-model="napcatHttpApiUrl"
            :label="t('settings.pages.modules.messaging-qq.napcat-http-api-url')"
            :description="t('settings.pages.modules.messaging-qq.napcat-http-api-url-description')"
            :placeholder="t('settings.pages.modules.messaging-qq.napcat-http-api-url-placeholder')"
          />

          <FieldInput
            v-model="napcatHttpApiToken"
            type="password"
            :label="t('settings.pages.modules.messaging-qq.napcat-http-api-token')"
            :description="t('settings.pages.modules.messaging-qq.napcat-http-api-token-description')"
            :placeholder="t('settings.pages.modules.messaging-qq.napcat-http-api-token-placeholder')"
          />

          <FieldCheckbox
            v-model="napcatGroupOnlyReplyAt"
            :label="t('settings.pages.modules.messaging-qq.napcat-group-only-reply-at')"
            :description="t('settings.pages.modules.messaging-qq.napcat-group-only-reply-at-description')"
          />

          <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            <span>{{ t('settings.pages.modules.messaging-qq.help-label') }}</span>
            <a
              href="https://napcat.apifox.cn/"
              target="_blank"
              rel="noopener noreferrer"
              :class="['ml-1 text-sky-600 hover:text-sky-500 dark:text-sky-400 underline decoration-dashed underline-offset-4']"
            >
              https://napcat.apifox.cn/
            </a>
          </div>
        </template>
      </div>
    </Section>

    <Section
      v-if="method === 'official'"
      :title="t('settings.pages.modules.messaging-qq.section-voice-title')"
      :description="t('settings.pages.modules.messaging-qq.section-voice-description')"
      icon="i-solar:microphone-3-bold-duotone"
    >
      <div :class="['flex flex-col gap-2', aiGirlfriendEnabled ? 'opacity-50 pointer-events-none' : '']">
        <Radio
          id="qq-voice-reply-both"
          v-model="voiceReplyMode"
          name="qq-voice-reply-mode"
          value="both"
          :title="t('settings.pages.modules.messaging-qq.voice-reply-modes.both')"
        />
        <Radio
          id="qq-voice-reply-voice"
          v-model="voiceReplyMode"
          name="qq-voice-reply-mode"
          value="voice"
          :title="t('settings.pages.modules.messaging-qq.voice-reply-modes.voice')"
        />
        <Radio
          id="qq-voice-reply-text"
          v-model="voiceReplyMode"
          name="qq-voice-reply-mode"
          value="text"
          :title="t('settings.pages.modules.messaging-qq.voice-reply-modes.text')"
        />
      </div>

      <div
        v-if="voiceReplyMode !== 'text' && !ttsConfigured"
        :class="[
          'mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800',
          'dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200 flex items-start gap-2',
        ]"
      >
        <div class="i-solar:danger-triangle-bold-duotone mt-0.5 shrink-0 text-lg" />
        <div>{{ t('settings.pages.modules.messaging-qq.voice-reply-fallback-tip') }}</div>
      </div>

      <div
        :class="[
          'mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800',
          'dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200 flex items-start gap-2',
        ]"
      >
        <div class="i-solar:info-circle-bold-duotone mt-0.5 shrink-0 text-lg" />
        <div>{{ t('settings.pages.modules.messaging-qq.voice-reply-slow-tip') }}</div>
      </div>

      <div :class="['mt-4 flex items-center gap-2 text-xs']">
        <span :class="['text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.modules.messaging-qq.voice-generation-status') }}
        </span>
        <span
          :class="[
            'rounded-full px-2 py-0.5 font-medium',
            voiceGenerationStatus === 'generating'
              ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200'
              : voiceGenerationStatus === 'success'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                : voiceGenerationStatus === 'failed'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                  : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
          ]"
        >
          {{
            voiceGenerationStatus === 'generating'
              ? t('settings.pages.modules.messaging-qq.voice-generation-status-values.generating')
              : voiceGenerationStatus === 'success'
                ? t('settings.pages.modules.messaging-qq.voice-generation-status-values.success')
                : voiceGenerationStatus === 'failed'
                  ? t('settings.pages.modules.messaging-qq.voice-generation-status-values.failed')
                  : t('settings.pages.modules.messaging-qq.voice-generation-status-values.idle')
          }}
        </span>
        <span v-if="voiceSettingsSaving" :class="['text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.modules.messaging-qq.voice-settings-saving') }}
        </span>
      </div>

      <div v-if="voiceGenerationLastMessage" :class="['mt-2 text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 p-2 rounded-md break-all']">
        {{ voiceGenerationLastMessage }}
      </div>
    </Section>

    <Section
      :title="t('settings.pages.modules.messaging-qq.section-proactive-title')"
      :description="t('settings.pages.modules.messaging-qq.section-proactive-description')"
      icon="i-solar:chat-round-dots-bold-duotone"
    >
      <div :class="['grid gap-5']">
        <Collapsible v-if="hasBoundUserIds">
          <template #trigger="slotProps">
            <Button
              :label="boundDrawerLabel"
              variant="secondary"
              icon="i-solar:user-id-bold-duotone"
              @click="slotProps.setVisible(!slotProps.visible)"
            />
          </template>

          <div :class="['mt-3 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-700 dark:bg-neutral-900/40']">
            <div :class="['text-sm font-medium text-neutral-700 dark:text-neutral-300']">
              {{ t('settings.pages.modules.messaging-qq.bound-userids-label') }}
            </div>
            <div :class="['mt-2 flex flex-wrap gap-2']">
              <span
                v-for="userId in boundUserIds"
                :key="userId"
                :class="['rounded-md bg-white border border-neutral-200 px-2 py-1 text-xs text-neutral-700 shadow-sm dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200']"
              >
                {{ userId }}
              </span>
            </div>

            <div :class="['mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 grid gap-4']">
              <FieldCheckbox
                v-model="aiGirlfriendEnabled"
                :label="t('settings.pages.modules.messaging-qq.ai-girlfriend-label')"
                :description="t('settings.pages.modules.messaging-qq.ai-girlfriend-description')"
              />
            </div>

            <div :class="['mt-4']">
              <Button
                :label="clearingBoundUserIds ? t('settings.pages.modules.messaging-qq.clear-bound-userids-loading') : t('settings.pages.modules.messaging-qq.clear-bound-userids-button')"
                variant="danger"
                icon="i-solar:trash-bin-trash-bold-duotone"
                size="sm"
                @click="clearBoundUserIds"
              />
            </div>
          </div>
        </Collapsible>

        <div
          v-else
          :class="['rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/30 dark:text-neutral-400 flex items-center gap-2']"
        >
          <div class="i-solar:info-circle-bold-duotone shrink-0 text-lg text-neutral-400" />
          <div>
            <span>{{ t('settings.pages.modules.messaging-qq.no-bound-userids-tip-prefix') }}</span>
            <code class="mx-1 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-mono dark:bg-neutral-800">#绑定此账号</code>
            <span>{{ t('settings.pages.modules.messaging-qq.no-bound-userids-tip-suffix') }}</span>
          </div>
        </div>
      </div>
    </Section>

    <Section
      :title="t('settings.pages.modules.messaging-qq.section-meme-title')"
      :description="t('settings.pages.modules.messaging-qq.section-meme-description')"
      icon="i-solar:gallery-bold-duotone"
    >
      <div :class="['mb-4']">
        <FieldCheckbox
          v-model="syncMemePacksAcrossModules"
          :label="t('settings.pages.modules.messaging-qq.meme-library-shared-label')"
          :description="t('settings.pages.modules.messaging-qq.meme-library-shared-description')"
        />
      </div>

      <div :class="['mb-4', aiGirlfriendEnabled ? 'opacity-50 pointer-events-none' : '']">
        <FieldInput
          v-model="memeProbability"
          type="number"
          :label="t('settings.pages.modules.messaging-qq.meme-probability-label')"
          :description="t('settings.pages.modules.messaging-qq.meme-probability-description')"
          :placeholder="t('settings.pages.modules.messaging-qq.meme-probability-placeholder')"
        />
      </div>

      <div :class="['flex items-center justify-between mb-2']">
        <div :class="['text-sm font-medium text-neutral-700 dark:text-neutral-300']">
          状态列表
        </div>
        <Button
          :label="t('settings.pages.modules.messaging-qq.add-meme-state-button')"
          variant="secondary"
          size="sm"
          icon="i-solar:add-circle-bold-duotone"
          @click="addEmotionMemePack"
        />
      </div>

      <div v-if="emotionMemePacks.length === 0" :class="['mt-2 p-4 text-center rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.modules.messaging-qq.meme-empty-tip') }}
      </div>

      <template v-else>
        <div :class="['mt-2 overflow-x-auto pb-2 scrollbar-hide']">
          <div :class="['inline-flex min-w-full items-center gap-2']">
            <Button
              v-for="(pack, index) in emotionMemePacks"
              :key="`${pack.state || 'state'}-${index}`"
              :label="`${pack.state || t('settings.pages.modules.messaging-qq.meme-state-unnamed')} (${pack.images.length})`"
              :variant="index === activeEmotionMemePackIndex ? 'primary' : 'secondary-muted'"
              size="sm"
              :class="['shrink-0 whitespace-nowrap transition-colors']"
              @click="setActiveEmotionMemePack(index)"
            />
          </div>
        </div>

        <div v-if="activeEmotionMemePack" :class="['mt-2 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-700 dark:bg-neutral-900/30']">
          <div :class="['flex-1']">
            <FieldInput
              :model-value="activeEmotionMemePack.state"
              :label="t('settings.pages.modules.messaging-qq.meme-state-label')"
              :description="t('settings.pages.modules.messaging-qq.meme-state-description')"
              :placeholder="t('settings.pages.modules.messaging-qq.meme-state-placeholder')"
              @update:model-value="value => updateActiveEmotionState(String(value ?? ''))"
            />
          </div>

          <div :class="['mt-4 flex items-center gap-3']">
            <input
              :id="getMemeUploadInputId(activeEmotionMemePackIndex)"
              type="file"
              accept="image/*"
              multiple
              hidden
              @change="handleActiveMemeFileChange"
            >
            <label
              :for="getMemeUploadInputId(activeEmotionMemePackIndex)"
              :class="[
                'min-w-0 flex-1 cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium',
                'whitespace-nowrap text-primary-700 hover:bg-primary-100 transition-colors dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-400 dark:hover:bg-primary-900/40',
              ]"
            >
              <div class="i-solar:upload-square-bold-duotone text-lg" />
              {{ t('settings.pages.modules.messaging-qq.meme-upload-button') }}
            </label>
            <Button
              :label="t('settings.pages.modules.messaging-qq.remove-meme-state-button')"
              variant="danger"
              icon="i-solar:trash-bin-trash-bold-duotone"
              :class="['shrink-0']"
              @click="removeActiveEmotionMemePack"
            />
          </div>

          <div :class="['mt-2 text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.modules.messaging-qq.meme-upload-hint') }}
          </div>

          <div :class="['mt-5 flex items-center justify-between gap-2 border-t border-neutral-200 dark:border-neutral-700 pt-4']">
            <div :class="['text-sm font-medium text-neutral-700 dark:text-neutral-300']">
              {{ t('settings.pages.modules.messaging-qq.meme-preview-count', { count: activeEmotionMemePack.images.length }) }}
            </div>
            <Button
              v-if="activeEmotionMemePack.images.length > 12"
              :label="expandMemePreview ? t('settings.pages.modules.messaging-qq.meme-preview-collapse') : t('settings.pages.modules.messaging-qq.meme-preview-expand')"
              variant="ghost"
              size="sm"
              :icon="expandMemePreview ? 'i-solar:alt-arrow-up-line-duotone' : 'i-solar:alt-arrow-down-line-duotone'"
              @click="expandMemePreview = !expandMemePreview"
            />
          </div>

          <div
            v-if="activeEmotionMemePack.images.length === 0"
            :class="['mt-3 text-sm text-center text-neutral-500 dark:text-neutral-400 py-6 border border-dashed border-neutral-200 dark:border-neutral-700 rounded-lg']"
          >
            {{ t('settings.pages.modules.messaging-qq.meme-preview-empty') }}
          </div>

          <div
            v-else
            :class="[
              'mt-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-950 transition-all duration-300',
              expandMemePreview ? 'max-h-none overflow-visible' : 'max-h-72 overflow-y-auto',
            ]"
          >
            <div :class="['grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6']">
              <div
                v-for="(image, imageIndex) in activeEmotionMemePack.images"
                :key="`${image.id || 'no-id'}-${imageIndex}`"
                :class="['group rounded-lg border border-neutral-200 bg-neutral-50 p-1.5 dark:border-neutral-700 dark:bg-neutral-900/70']"
              >
                <img
                  :src="buildPreviewSrc(image)"
                  :alt="image.name"
                  :class="['aspect-square w-full rounded bg-white/70 p-1 object-contain dark:bg-neutral-900/50']"
                >
                <div :class="['mt-1 flex items-center justify-between gap-1']">
                  <div :class="['truncate text-[10px] text-neutral-700 dark:text-neutral-200']" :title="image.name">
                    {{ image.name }}
                  </div>
                  <button
                    class="ml-1 shrink-0 rounded bg-red-500/80 p-1 text-white hover:bg-red-500"
                    title="Delete"
                    @click="removeActiveEmotionImage(image.id)"
                  >
                    <div class="i-solar:trash-bin-trash-bold text-xs" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </Section>

    <div :class="['flex flex-wrap gap-3 pt-2']">
      <Button
        :label="t('settings.common.save')"
        variant="primary"
        icon="i-solar:diskette-bold-duotone"
        @click="saveSettings"
      />
    </div>

    <div v-if="configured" :class="['rounded-xl bg-green-50 border border-green-200 p-4 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300 flex items-center gap-3']">
      <div class="i-solar:check-circle-bold-duotone shrink-0 text-xl" />
      <div>{{ t('settings.pages.modules.messaging-qq.configured') }}</div>
    </div>

    <div v-else-if="connectionStatus === 'connecting'" :class="['rounded-xl bg-sky-50 border border-sky-200 p-4 text-sky-800 dark:bg-sky-900/20 dark:border-sky-800 dark:text-sky-300 flex items-center gap-3']">
      <div class="i-svg-spinners:3-dots-fade shrink-0 text-xl" />
      <div>{{ connectionMessage || t('settings.pages.modules.messaging-qq.connecting') }}</div>
    </div>

    <div v-if="connectionStatus === 'error'" :class="['rounded-xl bg-red-50 border border-red-200 p-4 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 flex items-start gap-3']">
      <div class="i-solar:danger-circle-bold-duotone mt-0.5 shrink-0 text-xl" />
      <div class="break-all">
        {{ connectionError || t('settings.pages.modules.messaging-qq.connection-error') }}
      </div>
    </div>

    <div
      :class="[
        'rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800',
        'dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200 flex items-start gap-3',
      ]"
    >
      <div class="i-solar:lightbulb-bolt-bold-duotone mt-0.5 shrink-0 text-xl" />
      <div>{{ t('settings.pages.modules.messaging-qq.pre-chat-tip') }}</div>
    </div>
  </div>
</template>
