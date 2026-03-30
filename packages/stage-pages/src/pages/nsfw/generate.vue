<script setup lang="ts">
import { buildHermesImagePromptRequest, createHttpHermesImagePromptTransport, generateHermesImagePromptViaTransport } from '@proj-airi/stage-ui/libs'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useCharacterStore } from '@proj-airi/stage-ui/stores/characters'
import { useNsfwMediaStore } from '@proj-airi/stage-ui/stores/nsfw-media'
import { Button } from '@proj-airi/ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const authStore = useAuthStore()
const characterStore = useCharacterStore()
const nsfwMediaStore = useNsfwMediaStore()

const loading = ref(false)
const error = ref('')
const saved = ref(false)
const selectedCharacterId = ref('')
const result = ref<null | {
  prompt: string
  negativePrompt: string
  tags: string[]
  sceneType?: string
}>(null)

const form = reactive({
  prompt: '',
  style: 'cinematic portrait',
  mood: 'intimate',
  framing: 'waist-up',
  aspectRatio: '3:4',
  comfyWorkflow: '',
})

onMounted(async () => {
  await characterStore.fetchList(true)

  if (!selectedCharacterId.value) {
    const first = Array.from(characterStore.characters.values()).find(char => char.nsfwEnabled && char.nsfwLevel !== 'none')
    if (first)
      selectedCharacterId.value = first.id
  }
})

const accessDenied = computed(() => !authStore.canAccessNsfw)
const characters = computed(() => Array.from(characterStore.characters.values())
  .filter(char => char.nsfwEnabled && char.nsfwLevel !== 'none')
  .sort((a, b) => Number(b.interactionsCount || 0) - Number(a.interactionsCount || 0)))
const selectedCharacter = computed(() => selectedCharacterId.value ? characterStore.getCharacter(selectedCharacterId.value) : null)
const selectedCharacterName = computed(() => selectedCharacter.value?.i18n?.[0]?.name || selectedCharacter.value?.characterId || '')

watch(selectedCharacterId, () => {
  error.value = ''
  result.value = null
  saved.value = false
})

async function generate() {
  if (!selectedCharacter.value)
    return

  loading.value = true
  error.value = ''
  saved.value = false

  try {
    const request = buildHermesImagePromptRequest({
      user: {
        id: authStore.userId,
        adultVerified: authStore.adultVerified,
        allowSensitiveContent: authStore.allowSensitiveContent,
        subscriptionTier: authStore.profile?.subscriptionTier ?? 'free',
        contentTier: authStore.contentTier,
      },
      character: selectedCharacter.value,
      prompt: form.prompt,
      style: form.style,
      mood: form.mood,
      framing: form.framing,
      aspectRatio: form.aspectRatio,
      route: 'nsfw',
    })

    const response = await generateHermesImagePromptViaTransport(request, createHttpHermesImagePromptTransport())
    result.value = {
      prompt: response.prompt,
      negativePrompt: response.negativePrompt,
      tags: response.tags,
      sceneType: response.sceneType,
    }
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to generate image prompt'
  }
  finally {
    loading.value = false
  }
}

async function saveToGallery() {
  if (!selectedCharacter.value || !result.value)
    return

  error.value = ''

  try {
    let workflow: Record<string, unknown> | undefined
    if (form.comfyWorkflow.trim()) {
      const parsed = JSON.parse(form.comfyWorkflow) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('ComfyUI workflow must be a JSON object in API prompt format')
      }
      workflow = parsed as Record<string, unknown>
    }

    const job = await nsfwMediaStore.createJob({
      characterId: selectedCharacter.value.id,
      route: 'nsfw',
      prompt: result.value.prompt,
      negativePrompt: result.value.negativePrompt,
      sceneType: result.value.sceneType,
      tags: result.value.tags,
      params: workflow
        ? {
            workflow,
            planner: {
              style: form.style,
              mood: form.mood,
              framing: form.framing,
              aspectRatio: form.aspectRatio,
            },
          }
        : {
            planner: {
              style: form.style,
              mood: form.mood,
              framing: form.framing,
              aspectRatio: form.aspectRatio,
            },
          },
    })

    await nsfwMediaStore.createGalleryItem({
      characterId: selectedCharacter.value.id,
      imageJobId: job.id,
      title: `${selectedCharacterName.value} · ${result.value.sceneType || 'nsfw'}`,
      prompt: result.value.prompt,
      negativePrompt: result.value.negativePrompt,
      sceneType: result.value.sceneType,
      tags: result.value.tags,
    })

    saved.value = true
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save NSFW gallery item'
  }
}
</script>

<template>
  <div class="min-h-screen px-4 py-8 md:px-8">
    <div mx-auto max-w-6xl class="space-y-6">
      <section class="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-neutral-950 via-fuchsia-950 to-black px-6 py-8 text-white shadow-sm md:px-10 md:py-12">
        <div class="absolute right--12 top--14 h-60 w-60 rounded-full bg-fuchsia-400/15 blur-3xl" />
        <div class="absolute bottom--12 left-8 h-48 w-48 rounded-full bg-rose-300/10 blur-3xl" />
        <div class="relative z-1 max-w-3xl">
          <div class="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] backdrop-blur">
            NSFW Generate
          </div>
          <h1 class="text-4xl font-semibold leading-tight md:text-5xl">
            Build image prompts for explicit companions
          </h1>
          <p class="mt-4 max-w-2xl text-sm text-white/75 leading-6 md:text-base">
            Hermes plans the prompt, negative prompt, and tags from your character persona, relationship mode, and NSFW gating rules before anything goes to ComfyUI.
          </p>
          <div class="mt-6 flex flex-wrap gap-3">
            <Button @click="router.push('/nsfw')">
              Back to NSFW Explore
            </Button>
            <Button variant="ghost" class="bg-white/10 text-white hover:bg-white/15" @click="router.push('/nsfw/gallery')">
              Open Gallery
            </Button>
            <Button variant="ghost" class="bg-white/10 text-white hover:bg-white/15" @click="router.push('/settings/account')">
              Account Access
            </Button>
          </div>
        </div>
      </section>

      <section v-if="accessDenied" class="rounded-[2rem] bg-white p-10 text-center shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        <h2 class="text-2xl font-semibold">
          NSFW image generation is disabled
        </h2>
        <p class="mt-3 text-sm text-neutral-600 leading-6 dark:text-neutral-300">
          This account needs adult verification, sensitive content enabled, and a non-standard content tier before NSFW image planning is available.
        </p>
      </section>

      <template v-else>
        <section class="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
          <div class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
            <h2 class="text-lg font-semibold">
              Planner Input
            </h2>

            <div class="mt-4 space-y-4">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium">Character</label>
                <select v-model="selectedCharacterId" class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800">
                  <option value="" disabled>
                    Select a character
                  </option>
                  <option v-for="character in characters" :key="character.id" :value="character.id">
                    {{ character.i18n?.[0]?.name || character.characterId }} · {{ character.nsfwLevel }}
                  </option>
                </select>
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium">Scene Prompt</label>
                <textarea
                  v-model="form.prompt"
                  rows="6"
                  class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
                  placeholder="Describe the shot you want, the pose, outfit, setting, or scene beat."
                />
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium">Style</label>
                  <input v-model="form.style" class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800">
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium">Mood</label>
                  <input v-model="form.mood" class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800">
                </div>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium">Framing</label>
                  <input v-model="form.framing" class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800">
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium">Aspect Ratio</label>
                  <input v-model="form.aspectRatio" class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800">
                </div>
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium">ComfyUI API Workflow JSON</label>
                <textarea
                  v-model="form.comfyWorkflow"
                  rows="7"
                  class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-xs outline-none dark:border-neutral-700 dark:bg-neutral-800"
                />
                <p class="text-xs text-neutral-500 leading-5 dark:text-neutral-400">
                  Optional override. If left empty, AIRI now builds a default API-format ComfyUI workflow from the planned prompt, negative prompt, aspect ratio, and server checkpoint setting.
                </p>
              </div>

              <div class="flex items-center gap-3">
                <Button :disabled="loading || !selectedCharacter || !form.prompt.trim()" @click="generate">
                  {{ loading ? 'Planning...' : 'Generate Image Prompt' }}
                </Button>
                <span v-if="selectedCharacterName" class="text-xs text-neutral-500 dark:text-neutral-400">
                  Active: {{ selectedCharacterName }}
                </span>
                <span v-if="saved" class="text-xs text-emerald-600 dark:text-emerald-400">
                  Saved to gallery
                </span>
              </div>

              <p v-if="error" class="text-sm text-rose-600 dark:text-rose-400">
                {{ error }}
              </p>
            </div>
          </div>

          <div class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
            <h2 class="text-lg font-semibold">
              Planned Prompt
            </h2>

            <div v-if="result" class="mt-4 space-y-5">
              <div>
                <div class="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                  Scene Type
                </div>
                <div class="mt-1 text-sm font-medium">
                  {{ result.sceneType || 'nsfw' }}
                </div>
              </div>

              <div>
                <div class="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                  Prompt
                </div>
                <div class="mt-2 rounded-2xl bg-neutral-50 px-4 py-4 text-sm leading-6 dark:bg-neutral-800">
                  {{ result.prompt }}
                </div>
              </div>

              <div>
                <div class="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                  Negative Prompt
                </div>
                <div class="mt-2 rounded-2xl bg-neutral-50 px-4 py-4 text-sm leading-6 dark:bg-neutral-800">
                  {{ result.negativePrompt || 'None' }}
                </div>
              </div>

              <div>
                <div class="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                  Tags
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <span
                    v-for="tag in result.tags"
                    :key="tag"
                    class="rounded-full bg-fuchsia-100 px-3 py-1 text-xs font-medium text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>

              <div class="flex items-center gap-3">
                <Button @click="saveToGallery">
                  Save To Gallery
                </Button>
                <Button variant="ghost" @click="router.push('/nsfw/gallery')">
                  Open Gallery
                </Button>
              </div>
            </div>

            <div v-else class="mt-4 rounded-2xl border border-dashed border-neutral-200 px-5 py-10 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              Generate a prompt to see the final scene package Hermes would send toward your image pipeline.
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  title: NSFW Generate
  description: Plan NSFW image prompts through Hermes before sending them to media generation
  stageTransition:
    name: slide
</route>
