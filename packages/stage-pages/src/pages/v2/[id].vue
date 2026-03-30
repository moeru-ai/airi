<script setup lang="ts">
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useCharacterStore } from '@proj-airi/stage-ui/stores/characters'
import { Button } from '@proj-airi/ui'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const characterStore = useCharacterStore()
const authStore = useAuthStore()

const loading = ref(true)
const failed = ref(false)

const characterId = computed(() => String(route.params.id || ''))

onMounted(async () => {
  loading.value = true
  failed.value = false
  try {
    await characterStore.fetchById(characterId.value)
  }
  catch {
    failed.value = true
  }
  finally {
    loading.value = false
  }
})

const character = computed(() => characterStore.getCharacter(characterId.value))
const i18n = computed(() => character.value?.i18n?.[0])
const badges = computed(() => {
  if (!character.value)
    return []

  const items = [character.value.relationshipMode, character.value.visibility]
  if (character.value.nsfwEnabled)
    items.push(character.value.nsfwLevel)
  return items
})

const starterMessages = computed(() => character.value?.personaProfile?.starterMessages || [])
const boundaries = computed(() => character.value?.personaProfile?.boundaries || [])
const liked = computed(() => !!character.value?.likes?.some(item => item.userId === authStore.user?.id))
const bookmarked = computed(() => !!character.value?.bookmarks?.some(item => item.userId === authStore.user?.id))

async function enterStage() {
  if (!character.value)
    return

  await characterStore.activateCharacter(character.value.id)
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen px-4 py-8 md:px-8">
    <div mx-auto max-w-6xl>
      <div class="mb-6 flex items-center justify-between gap-4">
        <Button variant="ghost" @click="router.push('/v2')">
          Back to Explore
        </Button>
        <div v-if="character" class="flex items-center gap-2">
          <Button variant="ghost" @click="characterStore.bookmark(character.id)">
            {{ bookmarked ? 'Bookmarked' : 'Bookmark' }}
          </Button>
          <Button variant="ghost" @click="characterStore.like(character.id)">
            {{ liked ? 'Liked' : 'Like' }}
          </Button>
        </div>
      </div>

      <div v-if="loading" class="rounded-[2rem] bg-white p-10 text-center shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        Loading companion profile...
      </div>

      <div v-else-if="failed || !character || !i18n" class="rounded-[2rem] bg-white p-10 text-center shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        Character not found.
      </div>

      <div v-else class="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <section class="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-neutral-950 via-neutral-900 to-rose-950 text-white shadow-sm">
          <img
            :src="character.coverUrl"
            :alt="i18n.name"
            class="absolute inset-0 h-full w-full object-cover opacity-40"
          >
          <div class="absolute inset-0 bg-linear-to-t from-black via-black/45 to-transparent" />
          <div class="relative z-1 flex min-h-[34rem] flex-col justify-end gap-5 p-6 md:p-8">
            <div class="flex flex-wrap gap-2">
              <span
                v-for="badge in badges"
                :key="badge"
                class="rounded-full bg-white/12 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] backdrop-blur"
              >
                {{ badge }}
              </span>
            </div>

            <div class="max-w-2xl">
              <h1 class="text-4xl font-semibold md:text-5xl">
                {{ i18n.name }}
              </h1>
              <p class="mt-3 max-w-xl text-sm text-white/80 leading-6 md:text-base">
                {{ character.personaProfile?.personality || i18n.description }}
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                <div class="text-[11px] text-white/60 uppercase tracking-[0.16em]">
                  Dynamic
                </div>
                <div class="mt-1 text-sm font-medium">
                  {{ character.relationshipMode }}
                </div>
              </div>
              <div class="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                <div class="text-[11px] text-white/60 uppercase tracking-[0.16em]">
                  Personality
                </div>
                <div class="mt-1 text-sm font-medium">
                  {{ character.personaProfile?.speakingStyle || 'Adaptive' }}
                </div>
              </div>
              <div class="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                <div class="text-[11px] text-white/60 uppercase tracking-[0.16em]">
                  Access
                </div>
                <div class="mt-1 text-sm font-medium">
                  {{ character.visibility }}
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-3">
              <Button @click="enterStage">
                Enter Stage
              </Button>
              <Button variant="ghost" class="bg-white/10 text-white hover:bg-white/15" @click="router.push('/settings/characters')">
                Edit Character
              </Button>
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-6">
          <div class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
            <h2 class="text-lg font-semibold">
              Scenario
            </h2>
            <p class="mt-3 text-sm text-neutral-600 leading-6 dark:text-neutral-300">
              {{ character.personaProfile?.scenario || i18n.description }}
            </p>
          </div>

          <div class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
            <h2 class="text-lg font-semibold">
              Starter Messages
            </h2>
            <div v-if="starterMessages.length" class="mt-3 flex flex-col gap-2">
              <div
                v-for="message in starterMessages"
                :key="message"
                class="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                {{ message }}
              </div>
            </div>
            <p v-else class="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              No custom starters yet.
            </p>
          </div>

          <div class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
            <h2 class="text-lg font-semibold">
              Boundaries
            </h2>
            <div v-if="boundaries.length" class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="boundary in boundaries"
                :key="boundary"
                class="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700 font-medium dark:bg-amber-500/15 dark:text-amber-300"
              >
                {{ boundary }}
              </span>
            </div>
            <p v-else class="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              No explicit boundaries configured.
            </p>
          </div>

          <div class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
            <h2 class="text-lg font-semibold">
              Engagement
            </h2>
            <div class="mt-4 grid grid-cols-3 gap-3">
              <div class="rounded-2xl bg-neutral-50 px-4 py-3 text-center dark:bg-neutral-800">
                <div class="text-xl font-semibold">
                  {{ character.likesCount }}
                </div>
                <div class="text-xs text-neutral-500 uppercase tracking-wide dark:text-neutral-400">
                  Likes
                </div>
              </div>
              <div class="rounded-2xl bg-neutral-50 px-4 py-3 text-center dark:bg-neutral-800">
                <div class="text-xl font-semibold">
                  {{ character.bookmarksCount }}
                </div>
                <div class="text-xs text-neutral-500 uppercase tracking-wide dark:text-neutral-400">
                  Saves
                </div>
              </div>
              <div class="rounded-2xl bg-neutral-50 px-4 py-3 text-center dark:bg-neutral-800">
                <div class="text-xl font-semibold">
                  {{ character.interactionsCount }}
                </div>
                <div class="text-xs text-neutral-500 uppercase tracking-wide dark:text-neutral-400">
                  Chats
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
