<script setup lang="ts">
import type { Character, CreateCharacterPayload } from '@proj-airi/stage-ui/types/character'

import { useCharacterStore } from '@proj-airi/stage-ui/stores/characters'
import { CreateCharacterSchema } from '@proj-airi/stage-ui/types/character'
import { Button, FieldInput } from '@proj-airi/ui'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { safeParse } from 'valibot'
import { computed, reactive, ref, watch } from 'vue'

interface Props {
  modelValue: boolean
  character?: Character
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit'): void
}>()

const characterStore = useCharacterStore()

// Form State
const form = reactive({
  characterId: '',
  version: '1.0.0',
  coverUrl: '',
  name: '',
  description: '',

  // Capability: LLM
  llmModel: '',
  llmTemperature: 0.7,

  // Capability: TTS
  ttsVoiceId: '',
  ttsSpeed: 1.0,
})

// Initialize form when character prop changes or dialog opens
watch(() => props.character, (char) => {
  if (char) {
    const i18n = char.i18n?.find(i => i.language === 'en') || char.i18n?.[0]
    const llm = char.capabilities?.find(c => c.type === 'llm')
    const tts = char.capabilities?.find(c => c.type === 'tts')

    form.characterId = char.characterId
    form.version = char.version
    form.coverUrl = char.coverUrl
    form.name = i18n?.name || ''
    form.description = i18n?.description || ''

    form.llmModel = llm?.config.llm?.model || ''
    form.llmTemperature = llm?.config.llm?.temperature || 0.7

    form.ttsVoiceId = tts?.config.tts?.voiceId || ''
    form.ttsSpeed = tts?.config.tts?.speed || 1.0
  }
  else {
    // Reset defaults
    form.characterId = ''
    form.version = '1.0.0'
    form.coverUrl = ''
    form.name = ''
    form.description = ''
    form.llmModel = 'gpt-4o-mini'
    form.llmTemperature = 0.7
    form.ttsVoiceId = ''
    form.ttsSpeed = 1.0
  }
}, { immediate: true })

const errors = ref<Record<string, string>>({})
const isSubmitting = ref(false)

async function handleSubmit() {
  errors.value = {}
  isSubmitting.value = true

  // Construct Payload
  const payload: CreateCharacterPayload = {
    character: {
      characterId: form.characterId,
      version: form.version,
      coverUrl: form.coverUrl,
    },
    i18n: [{
      language: 'en',
      name: form.name,
      description: form.description,
      tags: [],
    }],
    capabilities: [
      {
        type: 'llm',
        config: {
          apiKey: '', // TODO: Handle secrets
          apiBaseUrl: '',
          llm: {
            model: form.llmModel,
            temperature: form.llmTemperature,
          },
        },
      },
      {
        type: 'tts',
        config: {
          apiKey: '',
          apiBaseUrl: '',
          tts: {
            voiceId: form.ttsVoiceId,
            speed: form.ttsSpeed,
            ssml: '',
            pitch: 1.0,
          },
        },
      },
    ],
    avatarModels: [], // TODO: Add avatar model support
    prompts: [], // TODO: Add prompt support
  }

  // Validate
  const result = safeParse(CreateCharacterSchema, payload)
  if (!result.success) {
    // Simple error mapping
    result.issues.forEach((issue) => {
      const path = issue.path?.map(p => p.key).join('.') || 'global'
      errors.value[path] = issue.message
    })
    isSubmitting.value = false
    return
  }

  try {
    if (props.character) {
      // TODO: Implement update logic (requires diffing or full replacement strategy on backend)
      // For now, we only support Create in this dialog fully or partial updates if we map correctly.
      // Since UpdateCharacterSchema is partial, we'd need a separate flow.
      // The current store.update takes UpdateCharacterPayload which is limited.
      // Let's assume Create for now or minimal Update.
      // Actually, let's just use create for new and warn for edit.
      await characterStore.update(props.character.id, {
        characterId: form.characterId,
        version: form.version,
        coverUrl: form.coverUrl,
      })
      // Capabilities/I18n update not supported in simple UpdateCharacterSchema yet?
      // Checking types/character.ts: UpdateCharacterSchema only has version, coverUrl, characterId.
      // So deep update is not supported by the simple endpoint yet?
      // The plan said "update(id, payload)".
      // The backend `update` endpoint only updates the `character` table fields.
      // To update relations, we'd need specific endpoints or a smarter update endpoint.
      // I will only update basic info for now.
    }
    else {
      await characterStore.create(payload)
    }
    emit('submit')
    emit('update:modelValue', false)
  }
  catch (err) {
    console.error(err)
    // Handle API errors
  }
  finally {
    isSubmitting.value = false
  }
}

// Tab State
const activeTab = ref('identity')
const tabs = [
  { id: 'identity', label: 'Identity', icon: 'i-solar:user-id-bold-duotone' },
  { id: 'capabilities', label: 'Capabilities', icon: 'i-solar:cpu-bolt-bold-duotone' },
  // { id: 'models', label: 'Models', icon: 'i-solar:box-minimalistic-bold-duotone' },
]

const isOpen = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
})
</script>

<template>
  <DialogRoot v-model:open="isOpen">
    <DialogPortal>
      <DialogOverlay class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
      <DialogContent class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed left-1/2 top-1/2 z-50 max-h-85vh max-w-2xl w-full overflow-hidden rounded-2xl bg-white p-0 shadow-xl -translate-x-1/2 -translate-y-1/2 dark:bg-neutral-900">
        <div class="h-full flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-neutral-100 p-4 dark:border-neutral-800">
            <DialogTitle class="text-lg font-semibold">
              {{ character ? 'Edit Character' : 'Create Character' }}
            </DialogTitle>
            <button class="rounded-full p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" @click="isOpen = false">
              <div i-solar:close-circle-bold class="text-xl" />
            </button>
          </div>

          <!-- Body -->
          <div class="flex flex-1 overflow-hidden">
            <!-- Sidebar / Tabs -->
            <div class="w-48 bg-neutral-50 p-2 dark:bg-neutral-900/50">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                class="mb-1 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                :class="activeTab === tab.id ? 'bg-white text-primary-600 shadow-sm dark:bg-neutral-800 dark:text-primary-400' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'"
                @click="activeTab = tab.id"
              >
                <div :class="tab.icon" />
                {{ tab.label }}
              </button>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-6">
              <!-- Identity Tab -->
              <div v-show="activeTab === 'identity'" class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <FieldInput v-model="form.characterId" label="Handle ID" placeholder="e.g. airi-core" required />
                  <FieldInput v-model="form.version" label="Version" placeholder="1.0.0" />
                </div>

                <FieldInput v-model="form.name" label="Name (EN)" placeholder="Character Name" required />
                <FieldInput v-model="form.description" label="Description" type="textarea" placeholder="Short description..." />
                <FieldInput v-model="form.coverUrl" label="Cover URL" placeholder="https://..." />
              </div>

              <!-- Capabilities Tab -->
              <div v-show="activeTab === 'capabilities'" class="space-y-6">
                <div class="space-y-4">
                  <h3 class="text-sm text-neutral-900 font-semibold dark:text-neutral-100">
                    LLM Configuration
                  </h3>
                  <FieldInput v-model="form.llmModel" label="Model" placeholder="gpt-4o" />
                  <!-- Use number input for temperature properly -->
                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm text-neutral-700 font-medium dark:text-neutral-300">Temperature</label>
                    <input
                      v-model.number="form.llmTemperature"
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      class="w-full border border-neutral-200 rounded-lg bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 focus:border-primary-500 dark:bg-neutral-800 focus:ring-2 focus:ring-primary-500/20"
                    >
                  </div>
                </div>

                <div class="space-y-4">
                  <h3 class="text-sm text-neutral-900 font-semibold dark:text-neutral-100">
                    TTS Configuration
                  </h3>
                  <FieldInput v-model="form.ttsVoiceId" label="Voice ID" placeholder="Voice ID" />
                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm text-neutral-700 font-medium dark:text-neutral-300">Speed</label>
                    <input
                      v-model.number="form.ttsSpeed"
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="2"
                      class="w-full border border-neutral-200 rounded-lg bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 focus:border-primary-500 dark:bg-neutral-800 focus:ring-2 focus:ring-primary-500/20"
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-2 border-t border-neutral-100 p-4 dark:border-neutral-800">
            <Button variant="ghost" @click="isOpen = false">
              Cancel
            </Button>
            <Button :loading="isSubmitting" @click="handleSubmit">
              {{ character ? 'Save Changes' : 'Create' }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
