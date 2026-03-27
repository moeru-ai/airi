<script setup lang="ts">
import type { WeChatMemeImageConfig } from '../../stores/modules/wechat'

import { Button, FieldCheckbox, FieldInput, Radio } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import Section from '../layouts/section.vue'

import { useWeChatStore } from '../../stores/modules/wechat'

const { t } = useI18n()
const wechatStore = useWeChatStore()
const {
  enabled,
  voiceReplyMode,
  aiGirlfriendEnabled,
  memeProbability,
  syncMemePacksAcrossModules,
  emotionMemePacks,
  mainUserId,
  ttsConfigured,
  qrcodeUrl,
  connectionStatus,
  connectionMessage,
  connectionError,
} = storeToRefs(wechatStore)

const activeEmotionMemePackIndex = shallowRef(0)
const expandMemePreview = shallowRef(true)
const activeEmotionMemePack = computed(() => {
  const packs = emotionMemePacks.value
  if (packs.length === 0)
    return null

  const index = Math.max(0, Math.min(activeEmotionMemePackIndex.value, packs.length - 1))
  return packs[index] ?? null
})
const hasMainUserId = computed(() => mainUserId.value.trim().length > 0)

function addEmotionMemePack() {
  wechatStore.addEmotionMemePack()
  activeEmotionMemePackIndex.value = emotionMemePacks.value.length - 1
}

function removeEmotionMemePack(index: number) {
  wechatStore.removeEmotionMemePack(index)
}

function removeActiveEmotionMemePack() {
  if (!activeEmotionMemePack.value)
    return

  removeEmotionMemePack(activeEmotionMemePackIndex.value)
}

function updateEmotionState(index: number, value: string) {
  wechatStore.updateEmotionMemePackState(index, value)
}

function updateActiveEmotionState(value: string) {
  if (!activeEmotionMemePack.value)
    return

  updateEmotionState(activeEmotionMemePackIndex.value, value)
}

function removeEmotionImage(index: number, imageId: string) {
  wechatStore.removeEmotionMemeImage(index, imageId)
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

function buildPreviewSrc(image: WeChatMemeImageConfig) {
  return `data:${image.mimeType};base64,${image.dataBase64}`
}

function getMemeUploadInputId(index: number) {
  return `wechat-meme-upload-${index}`
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
    const images = await Promise.all(files.map(async (file): Promise<WeChatMemeImageConfig> => {
      const buffer = await file.arrayBuffer()
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType: file.type || 'image/png',
        dataBase64: arrayBufferToBase64(buffer),
      }
    }))

    wechatStore.appendEmotionMemeImages(index, images)
    toast.success(t('settings.pages.modules.messaging-wechat.meme-upload-success', {
      count: images.length,
    }))
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('settings.pages.modules.messaging-wechat.meme-upload-failed'))
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
      :title="t('settings.pages.modules.messaging-wechat.section-connection-title')"
      :description="t('settings.pages.modules.messaging-wechat.section-connection-description')"
      icon="i-solar:network-bold-duotone"
    >
      <div :class="['flex flex-col gap-4']">
        <FieldCheckbox
          v-model="enabled"
          :label="t('settings.pages.modules.messaging-wechat.enable')"
          :description="t('settings.pages.modules.messaging-wechat.enable-description')"
        />

        <div
          v-if="connectionStatus === 'connecting' || connectionStatus === 'connected' || connectionStatus === 'error'" :class="[
            'rounded-xl border p-4 text-sm',
            connectionStatus === 'connected' ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
            : connectionStatus === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200',
          ]"
        >
          <div :class="['flex items-center gap-2 font-medium']">
            <div v-if="connectionStatus === 'connecting'" :class="['i-svg-spinners:ring-resize']" />
            <div v-else-if="connectionStatus === 'connected'" :class="['i-solar:check-circle-bold-duotone']" />
            <div v-else :class="['i-solar:danger-triangle-bold-duotone']" />
            {{ connectionStatus === 'connecting' ? t('settings.pages.modules.messaging-wechat.status.connecting')
              : connectionStatus === 'connected' ? t('settings.pages.modules.messaging-wechat.status.connected')
                : t('settings.pages.modules.messaging-wechat.status.error') }}
          </div>
          <div v-if="connectionMessage || connectionError" :class="['mt-1 opacity-90']">
            {{ connectionError || connectionMessage }}
          </div>

          <div v-if="qrcodeUrl" :class="['mt-4 flex flex-col items-center gap-2']">
            <img :src="qrcodeUrl" alt="WeChat Login QR Code" :class="['h-48 w-48 rounded-lg border-2 border-white/50 shadow-sm']">
            <span :class="['text-xs opacity-75']">{{ t('settings.pages.modules.messaging-wechat.scan-tip') }}</span>
          </div>
        </div>
      </div>
    </Section>

    <Section
      :title="t('settings.pages.modules.messaging-wechat.section-voice-title')"
      :description="t('settings.pages.modules.messaging-wechat.section-voice-description')"
      icon="i-solar:microphone-3-bold-duotone"
      :expand="false"
    >
      <div :class="['flex flex-col gap-2', aiGirlfriendEnabled ? 'opacity-50 pointer-events-none' : '']">
        <Radio
          id="wechat-voice-reply-both"
          v-model="voiceReplyMode"
          name="wechat-voice-reply-mode"
          value="both"
          :title="t('settings.pages.modules.messaging-wechat.voice-reply-modes.both')"
        />
        <Radio
          id="wechat-voice-reply-voice"
          v-model="voiceReplyMode"
          name="wechat-voice-reply-mode"
          value="voice"
          :title="t('settings.pages.modules.messaging-wechat.voice-reply-modes.voice')"
        />
        <Radio
          id="wechat-voice-reply-text"
          v-model="voiceReplyMode"
          name="wechat-voice-reply-mode"
          value="text"
          :title="t('settings.pages.modules.messaging-wechat.voice-reply-modes.text')"
        />
      </div>

      <div
        v-if="voiceReplyMode !== 'text' && !ttsConfigured"
        :class="[
          'mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800',
          'dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200 flex items-start gap-2',
        ]"
      >
        <div :class="['i-solar:danger-triangle-bold-duotone mt-0.5 shrink-0 text-lg']" />
        <div>{{ t('settings.pages.modules.messaging-wechat.voice-reply-fallback-tip') }}</div>
      </div>

      <div
        :class="[
          'mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800',
          'dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200 flex items-start gap-2',
        ]"
      >
        <div :class="['i-solar:info-circle-bold-duotone mt-0.5 shrink-0 text-lg']" />
        <div>{{ t('settings.pages.modules.messaging-wechat.voice-reply-slow-tip') }}</div>
      </div>

      <div
        :class="[
          'mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800',
          'dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200 flex items-start gap-2',
        ]"
      >
        <div :class="['i-solar:danger-triangle-bold-duotone mt-0.5 shrink-0 text-lg']" />
        <div>{{ t('settings.pages.modules.messaging-wechat.voice-playback-official-fix-tip') }}</div>
      </div>
    </Section>

    <Section
      :title="t('settings.pages.modules.messaging-wechat.section-proactive-title')"
      :description="t('settings.pages.modules.messaging-wechat.section-proactive-description')"
      icon="i-solar:chat-round-dots-bold-duotone"
      :expand="false"
    >
      <div :class="['grid gap-4']">
        <div
          :class="[
            'rounded-lg border p-4 text-sm',
            hasMainUserId
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200',
          ]"
        >
          <div :class="['font-medium']">
            {{ t('settings.pages.modules.messaging-wechat.main-account-label') }}
          </div>
          <div v-if="hasMainUserId" :class="['mt-1 font-mono break-all text-xs']">
            {{ mainUserId }}
          </div>
          <div v-else :class="['mt-1 opacity-90']">
            {{ t('settings.pages.modules.messaging-wechat.main-account-empty-tip') }}
          </div>
          <div :class="['mt-2 text-xs opacity-80']">
            {{ t('settings.pages.modules.messaging-wechat.main-account-auto-bind-tip') }}
          </div>
        </div>

        <FieldCheckbox
          v-model="aiGirlfriendEnabled"
          :label="t('settings.pages.modules.messaging-wechat.ai-girlfriend-label')"
          :description="t('settings.pages.modules.messaging-wechat.ai-girlfriend-description')"
        />
      </div>
    </Section>

    <Section
      :title="t('settings.pages.modules.messaging-wechat.section-meme-title')"
      :description="t('settings.pages.modules.messaging-wechat.section-meme-description')"
      icon="i-solar:gallery-bold-duotone"
      :expand="false"
    >
      <div :class="['mb-4']">
        <FieldCheckbox
          v-model="syncMemePacksAcrossModules"
          :label="t('settings.pages.modules.messaging-wechat.meme-library-shared-label')"
          :description="t('settings.pages.modules.messaging-wechat.meme-library-shared-description')"
        />
      </div>

      <div :class="['mb-4', aiGirlfriendEnabled ? 'opacity-50 pointer-events-none' : '']">
        <FieldInput
          v-model="memeProbability"
          type="number"
          :label="t('settings.pages.modules.messaging-wechat.meme-probability-label')"
          :description="t('settings.pages.modules.messaging-wechat.meme-probability-description')"
          :placeholder="t('settings.pages.modules.messaging-wechat.meme-probability-placeholder')"
        />
      </div>

      <div :class="['flex items-center justify-between mb-2']">
        <div :class="['text-sm font-medium text-neutral-700 dark:text-neutral-300']">
          {{ t('settings.pages.modules.messaging-wechat.meme-states-title') }}
        </div>
        <Button
          :label="t('settings.pages.modules.messaging-wechat.add-meme-state-button')"
          variant="secondary"
          size="sm"
          icon="i-solar:add-circle-bold-duotone"
          @click="addEmotionMemePack"
        />
      </div>

      <div v-if="emotionMemePacks.length === 0" :class="['mt-2 p-4 text-center rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.modules.messaging-wechat.meme-empty-tip') }}
      </div>

      <template v-else>
        <div :class="['mt-2 overflow-x-auto pb-2 scrollbar-hide']">
          <div :class="['inline-flex min-w-full items-center gap-2']">
            <Button
              v-for="(pack, index) in emotionMemePacks"
              :key="`${pack.state || 'state'}-${index}`"
              :label="`${pack.state || t('settings.pages.modules.messaging-wechat.meme-state-unnamed')} (${pack.images.length})`"
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
              :label="t('settings.pages.modules.messaging-wechat.meme-state-label')"
              :description="t('settings.pages.modules.messaging-wechat.meme-state-description')"
              :placeholder="t('settings.pages.modules.messaging-wechat.meme-state-placeholder')"
              @update:model-value="value => updateActiveEmotionState(String(value ?? ''))"
            />
          </div>

          <div :class="['mt-4 flex items-center gap-3']">
            <input
              :id="getMemeUploadInputId(activeEmotionMemePackIndex)"
              type="file"
              accept="image/*"
              multiple
              :class="['hidden']"
              @change="handleActiveMemeFileChange"
            >
            <label
              :for="getMemeUploadInputId(activeEmotionMemePackIndex)"
              :class="['min-w-0 flex-1 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-700 transition hover:border-sky-400 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200']"
            >
              <span :class="['i-solar:upload-bold-duotone text-base']" />
              {{ t('settings.pages.modules.messaging-wechat.meme-upload-button') }}
            </label>
            <Button
              :label="t('settings.pages.modules.messaging-wechat.remove-meme-state-button')"
              variant="danger"
              size="sm"
              icon="i-solar:trash-bin-trash-bold-duotone"
              :class="['shrink-0']"
              @click="removeActiveEmotionMemePack"
            />
          </div>

          <div :class="['mt-2 text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.modules.messaging-wechat.meme-upload-hint') }}
          </div>

          <div :class="['mt-4 rounded-lg border border-neutral-200 bg-white/80 p-3 dark:border-neutral-700 dark:bg-neutral-900/50']">
            <div :class="['flex items-center justify-between']">
              <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
                {{
                  activeEmotionMemePack.images.length > 0
                    ? t('settings.pages.modules.messaging-wechat.meme-preview-count', { count: activeEmotionMemePack.images.length })
                    : t('settings.pages.modules.messaging-wechat.meme-preview-empty')
                }}
              </div>
              <Button
                v-if="activeEmotionMemePack.images.length > 6"
                :label="expandMemePreview ? t('settings.pages.modules.messaging-wechat.meme-preview-collapse') : t('settings.pages.modules.messaging-wechat.meme-preview-expand')"
                variant="ghost"
                size="sm"
                icon="i-solar:alt-arrow-down-bold-duotone"
                :class="[expandMemePreview ? 'rotate-180' : '']"
                @click="expandMemePreview = !expandMemePreview"
              />
            </div>

            <div
              v-if="activeEmotionMemePack.images.length > 0"
              :class="['mt-3 grid grid-cols-3 gap-2']"
            >
              <div
                v-for="(image, imageIndex) in activeEmotionMemePack.images"
                v-show="expandMemePreview || imageIndex < 6"
                :key="image.id"
                :class="['rounded-lg border border-neutral-200 bg-neutral-50 p-1.5 dark:border-neutral-700 dark:bg-neutral-900/70']"
              >
                <img
                  :src="buildPreviewSrc(image)"
                  :alt="image.name"
                  :class="['aspect-square w-full rounded bg-white/70 p-1 object-contain dark:bg-neutral-900/50']"
                >
                <div :class="['mt-1 flex items-center justify-between gap-2']">
                  <span :class="['truncate text-xs text-neutral-700 dark:text-neutral-200']">{{ image.name }}</span>
                  <button
                    :title="t('settings.pages.modules.messaging-wechat.remove-meme-image-button')"
                    :class="['shrink-0 rounded bg-red-500/80 p-1 text-white transition hover:bg-red-500']"
                    @click="removeActiveEmotionImage(image.id)"
                  >
                    <span :class="['i-solar:trash-bin-trash-bold text-xs']" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </Section>

    <div
      :class="[
        'rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800',
        'dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200 flex items-start gap-2',
      ]"
    >
      <div :class="['i-solar:info-circle-bold-duotone mt-0.5 shrink-0 text-lg']" />
      <div>{{ t('settings.pages.modules.messaging-wechat.memory-activation-tip') }}</div>
    </div>
  </div>
</template>
