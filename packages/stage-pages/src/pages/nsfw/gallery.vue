<script setup lang="ts">
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useNsfwMediaStore } from '@proj-airi/stage-ui/stores/nsfw-media'
import { Button } from '@proj-airi/ui'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const authStore = useAuthStore()
const mediaStore = useNsfwMediaStore()

const accessDenied = computed(() => !authStore.canAccessNsfw)
const items = computed(() => mediaStore.sortedGalleryItems)

onMounted(() => {
  mediaStore.fetchGallery().catch(() => {})
})

function formatDate(value: number) {
  return new Date(value).toLocaleString()
}

function statusTone(status?: string | null) {
  switch (status) {
    case 'done':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    case 'failed':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
    case 'running':
    case 'submitting':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
    default:
      return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
  }
}
</script>

<template>
  <div class="min-h-screen px-4 py-8 md:px-8">
    <div mx-auto max-w-6xl class="space-y-6">
      <section class="bg-linear-to-br relative overflow-hidden rounded-[2rem] from-neutral-950 via-amber-950 to-black px-6 py-8 text-white shadow-sm md:px-10 md:py-12">
        <div class="absolute right--12 top--14 h-60 w-60 rounded-full bg-amber-400/15 blur-3xl" />
        <div class="absolute bottom--12 left-8 h-48 w-48 rounded-full bg-orange-300/10 blur-3xl" />
        <div class="relative z-1 max-w-3xl">
          <div class="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium tracking-[0.16em] uppercase backdrop-blur">
            NSFW Gallery
          </div>
          <h1 class="text-4xl font-semibold leading-tight md:text-5xl">
            Saved prompt plans and scene packages
          </h1>
          <p class="mt-4 max-w-2xl text-sm text-white/75 leading-6 md:text-base">
            This gallery only shows real prompt plans you saved from the NSFW generate flow. No stock images, no fake cards.
          </p>
          <div class="mt-6 flex flex-wrap gap-3">
            <Button @click="router.push('/nsfw/generate')">
              Open Generate
            </Button>
            <Button variant="ghost" class="bg-white/10 text-white hover:bg-white/15" @click="router.push('/nsfw')">
              Back to NSFW Explore
            </Button>
          </div>
        </div>
      </section>

      <section v-if="accessDenied" class="rounded-[2rem] bg-white p-10 text-center shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        <h2 class="text-2xl font-semibold">
          NSFW gallery is disabled
        </h2>
        <p class="mt-3 text-sm text-neutral-600 leading-6 dark:text-neutral-300">
          This account needs adult verification, sensitive content enabled, and a non-standard content tier before the NSFW gallery is available.
        </p>
      </section>

      <section v-else-if="!items.length" class="rounded-[2rem] bg-white p-10 text-center shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        <h2 class="text-2xl font-semibold">
          No saved prompt plans yet
        </h2>
        <p class="mt-3 text-sm text-neutral-600 leading-6 dark:text-neutral-300">
          Save a planned prompt from the generate page and it will show up here as a real gallery record.
        </p>
        <div class="mt-6 flex justify-center gap-3">
          <Button @click="router.push('/nsfw/generate')">
            Open Generate
          </Button>
          <Button variant="ghost" @click="router.push('/nsfw')">
            Back to Explore
          </Button>
        </div>
      </section>

      <section v-else class="grid gap-6 md:grid-cols-2">
        <article
          v-for="item in items"
          :key="item.id"
          class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="text-xs text-neutral-500 tracking-[0.16em] uppercase dark:text-neutral-400">
                {{ item.title || item.characterId }}
              </div>
              <div class="mt-2 text-lg font-semibold">
                {{ item.sceneType || 'nsfw' }}
              </div>
            </div>
            <div
              v-if="item.imageJobStatus"
              class="rounded-full px-3 py-1 text-xs font-medium tracking-[0.12em] uppercase"
              :class="statusTone(item.imageJobStatus)"
            >
              {{ item.imageJobStatus }}
            </div>
          </div>

          <div class="mt-4 space-y-4">
            <div
              v-if="item.imageJobErrorMessage"
              class="rounded-2xl bg-rose-50 px-4 py-4 text-sm text-rose-700 leading-6 dark:bg-rose-500/10 dark:text-rose-200"
            >
              {{ item.imageJobErrorMessage }}
            </div>

            <div
              v-else-if="item.imageJobStatus === 'running' || item.imageJobStatus === 'submitting' || item.imageJobStatus === 'queued'"
              class="rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-700 leading-6 dark:bg-amber-500/10 dark:text-amber-200"
            >
              Render job is still processing in ComfyUI.
            </div>

            <div
              v-else-if="item.imageJobResultMediaId || item.mediaId"
              class="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-700 leading-6 dark:bg-emerald-500/10 dark:text-emerald-200"
            >
              Media ready: {{ item.imageJobResultMediaId || item.mediaId }}
            </div>

            <div>
              <div class="text-[11px] text-neutral-500 font-medium tracking-[0.16em] uppercase dark:text-neutral-400">
                Prompt
              </div>
              <div class="mt-2 rounded-2xl bg-neutral-50 px-4 py-4 text-sm leading-6 dark:bg-neutral-800">
                {{ item.prompt }}
              </div>
            </div>

            <div>
              <div class="text-[11px] text-neutral-500 font-medium tracking-[0.16em] uppercase dark:text-neutral-400">
                Negative Prompt
              </div>
              <div class="mt-2 rounded-2xl bg-neutral-50 px-4 py-4 text-sm leading-6 dark:bg-neutral-800">
                {{ item.negativePrompt || 'None' }}
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <span
                v-for="tag in item.tags"
                :key="`${item.id}:${tag}`"
                class="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700 font-medium dark:bg-amber-500/15 dark:text-amber-300"
              >
                {{ tag }}
              </span>
            </div>

            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              Saved {{ formatDate(item.createdAt) }}
            </div>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  title: NSFW Gallery
  description: Saved NSFW prompt plans for future ComfyUI jobs and gallery records
  stageTransition:
    name: slide
</route>
