<script setup lang="ts">
import type { StickerEmotion, StickerEntry } from '../../types/sticker'

import { Button, FieldCheckbox, FieldInput, FieldInputFile, FieldSelect, GhostButton, SettingsCard } from '@proj-airi/ui'
import { useObjectUrl } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { chatStickers } from '../../assets/stickers'
import { StickerValidationError, validateStickerImage } from '../../libs/stickers/import'
import { useStickersStore } from '../../stores/modules/stickers'
import { stickerEmotions } from '../../types/sticker'

const { t } = useI18n()
const store = useStickersStore()
const { enabled, frequency, entries, artwork, error } = storeToRefs(store)
const frequencyOptions = computed(() => [25, 50, 75, 100].map(value => ({ value, label: t(`settings.pages.modules.stickers.frequency-options.${value}`) })))
const editingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const name = ref('')
const emotions = ref<StickerEmotion[]>([])
const files = ref<File[]>()
const selectedFile = computed(() => files.value?.[0])
const preview = useObjectUrl(selectedFile)
const validFile = ref(false)
const validating = ref(false)
const saving = ref(false)
const formError = ref('')
const editor = useTemplateRef<HTMLFormElement>('editor')
const editing = computed(() => entries.value.find(entry => entry.id === editingId.value))
const previewSrc = computed(() => validFile.value && preview.value ? preview.value : editing.value ? artwork.value[editing.value.assetId] : undefined)
const builtin = computed(() => chatStickers.some(sticker => sticker.id === editingId.value))

function displayName(entry: StickerEntry) {
  const bundled = chatStickers.find(sticker => sticker.id === entry.id)
  return bundled && entry.name === bundled.description ? t(`settings.pages.modules.stickers.artwork.${entry.id}`) : entry.name
}

function showError(cause: unknown) {
  formError.value = t(`settings.pages.modules.stickers.errors.${cause instanceof StickerValidationError ? cause.code : 'storage'}`)
}

watch(selectedFile, async (file) => {
  validFile.value = false
  formError.value = ''
  if (!file)
    return
  validating.value = true
  try {
    await validateStickerImage(file)
    if (selectedFile.value === file)
      validFile.value = true
  }
  catch (cause) {
    if (selectedFile.value === file)
      showError(cause)
  }
  finally {
    if (selectedFile.value === file)
      validating.value = false
  }
})

async function openEditor(entry?: StickerEntry) {
  deletingId.value = null
  editingId.value = entry?.id ?? 'import'
  name.value = entry ? displayName(entry) : ''
  emotions.value = entry ? [...entry.emotions] : []
  files.value = undefined
  validating.value = false
  formError.value = ''
  await nextTick()
  editor.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function toggleEmotion(emotion: StickerEmotion) {
  emotions.value = emotions.value.includes(emotion) ? emotions.value.filter(value => value !== emotion) : [...emotions.value, emotion]
}

async function save() {
  saving.value = true
  formError.value = ''
  try {
    if (editingId.value === 'import') {
      if (!selectedFile.value)
        throw new StickerValidationError('image')
      await store.add(selectedFile.value, name.value, emotions.value)
    }
    else if (editingId.value) {
      await store.save(editingId.value, name.value, emotions.value, selectedFile.value)
    }
    editingId.value = null
    files.value = undefined
  }
  catch (cause) {
    showError(cause)
  }
  finally {
    saving.value = false
  }
}

async function remove(entry: StickerEntry) {
  try {
    await store.remove(entry.id)
    deletingId.value = null
    if (editingId.value === entry.id)
      editingId.value = null
  }
  catch (cause) {
    showError(cause)
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-4']">
    <SettingsCard>
      <FieldCheckbox v-model="enabled" :label="t('settings.pages.modules.stickers.enable')" :description="t('settings.pages.modules.stickers.enable-description')" />
      <FieldSelect v-model="frequency" :disabled="!enabled" :label="t('settings.pages.modules.stickers.frequency')" :description="t('settings.pages.modules.stickers.frequency-description')" :options="frequencyOptions" />
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ t('settings.pages.modules.stickers.local-only') }}
      </p>
    </SettingsCard>
    <p v-if="error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ t('settings.pages.modules.stickers.errors.storage') }}
    </p>
    <div :class="['flex flex-wrap items-center justify-between gap-3']">
      <h2 :class="['text-lg font-medium']">
        {{ t('settings.pages.modules.stickers.catalog') }}
      </h2>
      <Button color="primary" variant="primary" @click="openEditor()">
        {{ t('settings.pages.modules.stickers.import') }}
      </Button>
    </div>
    <form v-if="editingId !== null" ref="editor" :aria-label="t('settings.pages.modules.stickers.editor')" :class="['flex flex-col gap-4', 'rounded-xl bg-neutral-100 p-4 dark:bg-neutral-900']" @submit.prevent="save">
      <FieldInputFile v-if="!builtin" v-model="files" accept="image/png,image/jpeg,image/webp,image/gif" :label="t(`settings.pages.modules.stickers.${editing ? 'replace' : 'image'}`)" :description="t('settings.pages.modules.stickers.image-limits')" :placeholder="t('settings.pages.modules.stickers.choose-file')" />
      <img v-if="previewSrc" :src="previewSrc" :alt="t('settings.pages.modules.stickers.preview')" width="160" height="160" :class="['size-40 object-contain']">
      <FieldInput v-model="name" :label="t('settings.pages.modules.stickers.name')" :description="t('settings.pages.modules.stickers.name-limit')" />
      <fieldset :class="['flex flex-col gap-2']">
        <legend :class="['mb-2 text-sm font-medium']">
          {{ t('settings.pages.modules.stickers.emotions') }}
        </legend>
        <div :class="['flex flex-wrap gap-2']">
          <GhostButton v-for="emotion in stickerEmotions" :key="emotion" type="button" :active="emotions.includes(emotion)" :aria-pressed="emotions.includes(emotion)" @click="toggleEmotion(emotion)">
            {{ t(`settings.pages.modules.stickers.emotion-labels.${emotion}`) }}
          </GhostButton>
        </div>
      </fieldset>
      <p v-if="formError" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
        {{ formError }}
      </p>
      <div :class="['flex flex-wrap gap-2']">
        <Button type="submit" color="primary" variant="primary" :loading="saving" :disabled="validating || (!!selectedFile && !validFile)">
          {{ t('settings.pages.modules.stickers.save') }}
        </Button>
        <Button type="button" :disabled="saving" @click="editingId = null; files = undefined">
          {{ t('settings.pages.modules.stickers.cancel') }}
        </Button>
      </div>
    </form>
    <p v-if="formError && editingId === null" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ formError }}
    </p>
    <ul :aria-label="t('settings.pages.modules.stickers.catalog')" :class="['grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4']">
      <li v-for="entry in entries" :key="entry.id" :class="['flex flex-col items-center gap-3', 'rounded-xl bg-neutral-100 p-3 dark:bg-neutral-900']">
        <img :src="artwork[entry.assetId]" :alt="displayName(entry)" width="96" height="96" :class="['size-24 object-contain']">
        <span :class="['max-w-full break-words text-center text-sm font-medium']">{{ displayName(entry) }}</span>
        <div :class="['flex flex-wrap justify-center gap-1']">
          <span v-for="emotion in entry.emotions" :key="emotion" :class="['rounded-full bg-neutral-200 px-2 py-1 text-xs dark:bg-neutral-800']">{{ t(`settings.pages.modules.stickers.emotion-labels.${emotion}`) }}</span>
        </div>
        <div :class="['mt-auto grid w-full grid-cols-2 gap-2']">
          <template v-if="deletingId === entry.id">
            <Button size="sm" block @click="deletingId = null">
              {{ t('settings.pages.modules.stickers.cancel') }}
            </Button>
            <Button size="sm" block color="red" variant="primary" :aria-label="t('settings.pages.modules.stickers.confirm-delete')" @click="remove(entry)">
              {{ t('settings.pages.modules.stickers.delete') }}
            </Button>
          </template>
          <template v-else>
            <Button size="sm" block @click="openEditor(entry)">
              {{ t('settings.pages.modules.stickers.edit') }}
            </Button>
            <Button size="sm" block color="red" variant="primary" @click="deletingId = entry.id">
              {{ t('settings.pages.modules.stickers.delete') }}
            </Button>
          </template>
        </div>
      </li>
    </ul>
    <p v-if="!entries.length" :class="['text-sm text-neutral-600 dark:text-neutral-400']">
      {{ t('settings.pages.modules.stickers.empty') }}
    </p>
    <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
      {{ t('settings.pages.modules.stickers.history-note') }}
    </p>
  </div>
</template>
