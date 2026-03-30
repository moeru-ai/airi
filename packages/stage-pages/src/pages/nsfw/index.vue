<script setup lang="ts">
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useCharacterStore } from '@proj-airi/stage-ui/stores/characters'
import { Button } from '@proj-airi/ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const characterStore = useCharacterStore()
const authStore = useAuthStore()
const router = useRouter()

const activeLevel = ref<'all' | 'suggestive' | 'explicit'>('all')
const selectedCharacterId = ref('')
const savingCharacter = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)

const editor = reactive({
  nsfwEnabled: false,
  nsfwLevel: 'suggestive' as 'none' | 'suggestive' | 'explicit',
  relationshipMode: 'companion' as 'companion' | 'romance' | 'roleplay',
  visibility: 'private' as 'private' | 'public' | 'unlisted',
  boundaries: '',
})

function formatCount(value: number | string) {
  const num = typeof value === 'string' ? Number.parseInt(value) : value
  if (Number.isNaN(num))
    return '0'

  const units = [
    { suffix: 'Q', value: 1_000_000_000_000_000 },
    { suffix: 'T', value: 1_000_000_000_000 },
    { suffix: 'B', value: 1_000_000_000 },
    { suffix: 'M', value: 1_000_000 },
    { suffix: 'K', value: 1_000 },
  ]

  for (const unit of units) {
    if (num >= unit.value) {
      const scaled = num / unit.value
      const digits = scaled >= 10 ? 0 : 1
      return `${scaled.toFixed(digits)}${unit.suffix}`
    }
  }

  return num.toString()
}

onMounted(() => {
  characterStore.fetchList(true)
})

async function openCharacter(id: string) {
  await characterStore.activateCharacter(id)
  router.push(`/nsfw/${id}`)
}

const characters = computed(() => Array.from(characterStore.characters.values())
  .filter((char) => {
    if (!char.nsfwEnabled || char.nsfwLevel === 'none')
      return false
    if (activeLevel.value === 'all')
      return true
    return char.nsfwLevel === activeLevel.value
  })
  .sort((a, b) => Number(b.interactionsCount || 0) - Number(a.interactionsCount || 0))
  .map((char) => {
    const i18n = char.i18n?.[0] || { name: char.characterId, tagline: '', description: '' }

    return {
      id: char.id,
      name: i18n.name,
      tagline: i18n.tagline || i18n.description,
      avatarUrl: char.avatarUrl,
      characterAvatarUrl: char.characterAvatarUrl,
      coverUrl: char.coverUrl,
      coverBackgroundUrl: char.coverBackgroundUrl,
      interactions: char.interactionsCount,
      likes: char.likesCount,
      bookmarks: char.bookmarksCount,
      visibility: char.visibility,
      nsfwLevel: char.nsfwLevel,
      relationshipMode: char.relationshipMode,
      personality: char.personaProfile?.personality,
      scenario: char.personaProfile?.scenario,
      liked: char.likes?.some(l => l.userId === authStore.user?.id),
      bookmarked: char.bookmarks?.some(b => b.userId === authStore.user?.id),
      priceCredit: char.priceCredit,
    }
  }))

const stats = computed(() => {
  const list = characters.value
  return {
    total: list.length,
    explicit: list.filter(item => item.nsfwLevel === 'explicit').length,
    suggestive: list.filter(item => item.nsfwLevel === 'suggestive').length,
    active: list.filter(item => item.id === characterStore.activeCharacterId).length,
  }
})

const featuredCharacter = computed(() => characters.value[0] || null)
const latestCharacters = computed(() => characters.value.slice(0, 4))
const accessDenied = computed(() => !authStore.canAccessNsfw)
const selectedCharacter = computed(() => selectedCharacterId.value ? characterStore.getCharacter(selectedCharacterId.value) : null)

const levels = [
  { id: 'all', label: 'All Levels' },
  { id: 'suggestive', label: 'Suggestive' },
  { id: 'explicit', label: 'Explicit' },
] as const

watch(selectedCharacter, (character) => {
  if (!character)
    return

  editor.nsfwEnabled = character.nsfwEnabled
  editor.nsfwLevel = character.nsfwLevel
  editor.relationshipMode = character.relationshipMode
  editor.visibility = character.visibility
  editor.boundaries = character.personaProfile?.boundaries?.join('\n') || ''
  saveError.value = ''
  saveSuccess.value = false
}, { immediate: true })

onMounted(() => {
  if (!selectedCharacterId.value) {
    const first = Array.from(characterStore.characters.values()).find(char => char.nsfwEnabled && char.nsfwLevel !== 'none')
    if (first)
      selectedCharacterId.value = first.id
  }
})

async function saveSelectedCharacter() {
  if (!selectedCharacter.value)
    return

  savingCharacter.value = true
  saveError.value = ''
  saveSuccess.value = false

  try {
    await characterStore.update(selectedCharacter.value.id, {
      nsfwEnabled: editor.nsfwEnabled,
      nsfwLevel: editor.nsfwLevel,
      relationshipMode: editor.relationshipMode,
      visibility: editor.visibility,
      personaProfile: {
        ...(selectedCharacter.value.personaProfile ?? {}),
        boundaries: editor.boundaries
          .split('\n')
          .map(item => item.trim())
          .filter(Boolean),
      },
    })
    saveSuccess.value = true
  }
  catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to save NSFW settings'
  }
  finally {
    savingCharacter.value = false
  }
}
</script>

<template>
  <div class="min-h-screen px-4 py-8 md:px-8">
    <div mx-auto max-w-7xl class="space-y-8">
      <section class="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-neutral-950 via-rose-950 to-black px-6 py-8 text-white shadow-sm md:px-10 md:py-12">
        <div class="absolute right--12 top--14 h-60 w-60 rounded-full bg-rose-400/15 blur-3xl" />
        <div class="absolute bottom--12 left-8 h-48 w-48 rounded-full bg-orange-300/10 blur-3xl" />
        <div class="relative z-1 max-w-3xl">
          <div class="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] backdrop-blur">
            NSFW Explore
          </div>
          <h1 class="max-w-2xl text-4xl font-semibold leading-tight md:text-5xl">
            Explicit companions, isolated from the normal catalog
          </h1>
          <p class="mt-4 max-w-2xl text-sm text-white/75 leading-6 md:text-base">
            Browse, rank, and launch adult characters here while your main `v2` surface stays clean. This page only pulls characters already marked for NSFW use.
          </p>
          <div class="mt-6 flex flex-wrap gap-2">
            <button
              v-for="level in levels"
              :key="level.id"
              class="rounded-full px-4 py-2 text-sm font-medium transition-all"
              :class="activeLevel === level.id
                ? 'bg-white text-neutral-950'
                : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15'"
              @click="activeLevel = level.id"
            >
              {{ level.label }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="accessDenied" class="rounded-[2rem] bg-white p-10 text-center shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        <h2 class="text-2xl font-semibold">
          NSFW access is disabled
        </h2>
        <p class="mt-3 text-sm text-neutral-600 leading-6 dark:text-neutral-300">
          This account needs adult verification, sensitive content enabled, and a non-standard content tier before the NSFW catalog is available.
        </p>
        <div class="mt-6 flex justify-center gap-3">
          <Button variant="ghost" @click="router.push('/v2')">
            Back to Normal Explore
          </Button>
          <Button @click="router.push('/settings')">
            Open Settings
          </Button>
        </div>
      </section>

      <template v-else>
      <section class="grid gap-4 lg:grid-cols-[1.3fr,0.7fr]">
        <div class="rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-semibold">
                NSFW Inventory
              </h2>
              <p class="mt-2 text-sm text-neutral-600 leading-6 dark:text-neutral-300">
                Only characters with `nsfwEnabled` and a non-`none` level show up here.
              </p>
            </div>
            <Button variant="ghost" @click="router.push('/settings/characters')">
              Manage Characters
            </Button>
          </div>
          <div class="mt-5 grid gap-3 sm:grid-cols-4">
            <div class="rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800">
              <div class="text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                Total
              </div>
              <div class="mt-1 text-2xl font-semibold">
                {{ stats.total }}
              </div>
            </div>
            <div class="rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800">
              <div class="text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                Explicit
              </div>
              <div class="mt-1 text-2xl font-semibold">
                {{ stats.explicit }}
              </div>
            </div>
            <div class="rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800">
              <div class="text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                Suggestive
              </div>
              <div class="mt-1 text-2xl font-semibold">
                {{ stats.suggestive }}
              </div>
            </div>
            <div class="rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800">
              <div class="text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                Active
              </div>
              <div class="mt-1 text-2xl font-semibold">
                {{ stats.active }}
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <h2 class="text-lg font-semibold">
            Route Split
          </h2>
          <p class="mt-2 text-sm text-neutral-600 leading-6 dark:text-neutral-300">
            Normal `v2` discovery stays clean. Adult discovery, explicit persona tags, and future gallery generation stay under `/nsfw`.
          </p>
          <div class="mt-5 flex flex-wrap gap-3">
            <Button @click="router.push('/v2')">
              Open Normal Explore
            </Button>
            <Button variant="ghost" @click="router.push('/settings/characters')">
              Edit Character Flags
            </Button>
          </div>
        </div>
      </section>

      <section class="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
        <div class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-lg font-semibold">
              Character Controls
            </h2>
            <span v-if="selectedCharacter" class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ selectedCharacter.i18n?.[0]?.name || selectedCharacter.characterId }}
            </span>
          </div>

          <div class="mt-4 space-y-3">
            <button
              v-for="character in characters"
              :key="character.id"
              type="button"
              class="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition"
              :class="selectedCharacterId === character.id
                ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                : 'bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700'"
              @click="selectedCharacterId = character.id"
            >
              <div class="min-w-0">
                <div class="line-clamp-1 text-sm font-medium">
                  {{ character.name }}
                </div>
                <div class="mt-1 line-clamp-1 text-xs opacity-75">
                  {{ character.nsfwLevel }} · {{ character.relationshipMode }}
                </div>
              </div>
              <div class="ml-4 shrink-0 text-xs opacity-75">
                {{ character.visibility }}
              </div>
            </button>
          </div>
        </div>

        <div class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <h2 class="text-lg font-semibold">
            NSFW Settings
          </h2>

          <div v-if="selectedCharacter" class="mt-4 space-y-4">
            <label class="flex items-center justify-between gap-4 rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800">
              <div>
                <div class="text-sm font-medium">
                  NSFW Enabled
                </div>
                <div class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Controls whether this character can appear in `/nsfw`.
                </div>
              </div>
              <input v-model="editor.nsfwEnabled" type="checkbox" class="h-4 w-4">
            </label>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium">NSFW Level</label>
                <select v-model="editor.nsfwLevel" class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800">
                  <option value="none">
                    None
                  </option>
                  <option value="suggestive">
                    Suggestive
                  </option>
                  <option value="explicit">
                    Explicit
                  </option>
                </select>
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium">Relationship Mode</label>
                <select v-model="editor.relationshipMode" class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800">
                  <option value="companion">
                    Companion
                  </option>
                  <option value="romance">
                    Romance
                  </option>
                  <option value="roleplay">
                    Roleplay
                  </option>
                </select>
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium">Visibility</label>
              <select v-model="editor.visibility" class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800">
                <option value="private">
                  Private
                </option>
                <option value="unlisted">
                  Unlisted
                </option>
                <option value="public">
                  Public
                </option>
              </select>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium">Boundaries</label>
              <textarea
                v-model="editor.boundaries"
                rows="5"
                class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
                placeholder="One per line"
              />
            </div>

            <div class="flex items-center gap-3">
              <Button :disabled="savingCharacter" @click="saveSelectedCharacter">
                {{ savingCharacter ? 'Saving...' : 'Save NSFW Settings' }}
              </Button>
              <span v-if="saveSuccess" class="text-sm text-emerald-600 dark:text-emerald-400">
                Saved
              </span>
              <span v-if="saveError" class="text-sm text-rose-600 dark:text-rose-400">
                {{ saveError }}
              </span>
            </div>
          </div>

          <div v-else class="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
            Select a character to edit its NSFW settings.
          </div>
        </div>
      </section>

      <section v-if="featuredCharacter" class="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
        <div class="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-neutral-950 via-neutral-900 to-rose-950 p-6 text-white shadow-sm">
          <img
            v-if="featuredCharacter.coverUrl"
            :src="featuredCharacter.coverUrl"
            :alt="featuredCharacter.name"
            class="absolute inset-0 h-full w-full object-cover opacity-25"
          >
          <div class="absolute inset-0 bg-linear-to-r from-black via-black/60 to-transparent" />
          <div class="relative z-1 max-w-xl">
            <div class="inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] backdrop-blur">
              Top By Chats
            </div>
            <h2 class="mt-4 text-3xl font-semibold">
              {{ featuredCharacter.name }}
            </h2>
            <p class="mt-3 text-sm leading-6 text-white/75">
              {{ featuredCharacter.personality || featuredCharacter.scenario || featuredCharacter.tagline }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <span class="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] backdrop-blur">
                {{ featuredCharacter.nsfwLevel }}
              </span>
              <span class="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] backdrop-blur">
                {{ featuredCharacter.relationshipMode }}
              </span>
              <span class="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] backdrop-blur">
                {{ formatCount(featuredCharacter.interactions) }} chats
              </span>
            </div>
            <div class="mt-6 flex flex-wrap gap-3">
              <Button @click="openCharacter(featuredCharacter.id)">
                Open Profile
              </Button>
              <Button variant="ghost" class="bg-white/10 text-white hover:bg-white/15" @click="characterStore.activateCharacter(featuredCharacter.id)">
                Activate Only
              </Button>
            </div>
          </div>
        </div>

        <div class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <h2 class="text-lg font-semibold">
            Recent NSFW Picks
          </h2>
          <div class="mt-4 space-y-3">
            <button
              v-for="character in latestCharacters"
              :key="character.id"
              type="button"
              class="flex w-full items-center justify-between rounded-2xl bg-neutral-50 px-4 py-3 text-left transition hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              @click="openCharacter(character.id)"
            >
              <div class="min-w-0">
                <div class="line-clamp-1 text-sm font-medium">
                  {{ character.name }}
                </div>
                <div class="mt-1 line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {{ character.personality || character.tagline }}
                </div>
              </div>
              <div class="ml-4 flex shrink-0 items-center gap-2">
                <span class="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  {{ character.nsfwLevel }}
                </span>
                <div class="i-solar:arrow-right-linear text-base text-neutral-400" />
              </div>
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="!characters.length"
        class="rounded-[2rem] bg-white p-10 text-center shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800"
      >
        <h2 class="text-2xl font-semibold">
          No NSFW characters available
        </h2>
        <p class="mt-3 text-sm text-neutral-600 leading-6 dark:text-neutral-300">
          Turn on NSFW for a character and assign a level before it appears here.
        </p>
        <div class="mt-6 flex justify-center gap-3">
          <Button @click="router.push('/settings/characters')">
            Open Character Settings
          </Button>
          <Button variant="ghost" @click="router.push('/v2')">
            Back to Normal Explore
          </Button>
        </div>
      </section>

      <section v-else class="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <article
          v-for="character in characters"
          :key="character.id"
          class="group relative aspect-[12/19] overflow-hidden rounded-3xl shadow-sm"
        >
          <div class="relative h-70% overflow-hidden rounded-2xl">
            <img
              v-if="character.coverBackgroundUrl"
              :src="character.coverBackgroundUrl"
              :alt="character.name"
              class="absolute inset-0 z-5 h-full w-full object-cover"
            >
            <div v-else class="absolute inset-0 z-5 h-full w-full bg-neutral-950" />
            <img
              v-if="character.coverUrl"
              :src="character.coverUrl"
              :alt="character.name"
              class="absolute left-0 top-0 z-5 h-full w-full object-cover transition duration-300 ease-in-out"
            >
          </div>

          <div class="relative z-7 h-30% overflow-hidden">
            <div class="relative z-1 h-full">
              <div class="relative flex h-full flex-col justify-between gap-2 px-3 pb-3 pt-2">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <img
                      v-if="character.characterAvatarUrl"
                      :src="character.characterAvatarUrl"
                      :alt="character.name"
                      class="h-7 w-7 rounded-full object-cover"
                    >
                    <div v-else class="h-7 w-7 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                    <div class="line-clamp-1 text-lg font-semibold">
                      {{ character.name }}
                    </div>
                  </div>
                  <div class="flex items-center gap-1 text-xs">
                    <div i-tabler:coins />
                    <div>{{ formatCount(character.priceCredit) }}</div>
                  </div>
                </div>

                <div class="flex flex-wrap gap-1.5">
                  <span class="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                    {{ character.nsfwLevel }}
                  </span>
                  <span class="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {{ character.relationshipMode }}
                  </span>
                  <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    {{ character.visibility }}
                  </span>
                </div>

                <div class="max-h-[3rem] flex-1 overflow-hidden text-xs text-neutral-500 line-clamp-3">
                  {{ character.personality || character.scenario || character.tagline }}
                </div>

                <div class="grid grid-cols-3 items-center">
                  <div class="flex items-center justify-start">
                    <Button variant="ghost" size="sm" aria-label="Bookmark" @click="characterStore.bookmark(character.id)">
                      <div
                        :class="[
                          character.bookmarked ? 'i-solar-star-bold' : 'i-solar-star-linear',
                          'inline-block text-base',
                          character.bookmarked ? 'text-amber-300 dark:text-amber-500' : 'text-neutral-400',
                        ]"
                      />
                      <span
                        :class="[
                          'text-xs',
                          character.bookmarked ? 'text-amber-500 dark:text-amber-300' : 'text-neutral-500',
                        ]"
                      >
                        {{ formatCount(character.bookmarks) }}
                      </span>
                    </Button>
                  </div>
                  <div class="flex items-center justify-center">
                    <Button variant="ghost" size="sm" aria-label="Like" @click="characterStore.like(character.id)">
                      <div
                        :class="[
                          character.liked ? 'i-solar-heart-bold' : 'i-solar-heart-outline',
                          'inline-block text-base',
                          character.liked ? 'text-rose-500 dark:text-rose-400' : 'text-neutral-400',
                        ]"
                      />
                      <span
                        :class="[
                          'text-xs',
                          character.liked ? 'text-rose-500 dark:text-rose-400' : 'text-neutral-500',
                        ]"
                      >
                        {{ formatCount(character.likes) }}
                      </span>
                    </Button>
                  </div>
                  <div class="flex items-center justify-end">
                    <button
                      type="button"
                      class="flex flex-row items-center gap-1 rounded-full bg-neutral-900/65 pl-1.5 pr-2 py-1"
                      @click="openCharacter(character.id)"
                    >
                      <div class="i-solar:chat-square-bold inline-block text-xs text-neutral-100" />
                      <span class="text-xs text-neutral-100">Open</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="absolute left-0 top-0 z-0 h-full w-full">
            <div class="absolute inset-0 z-2 h-full w-full bg-neutral-950/70 backdrop-blur-lg" />
            <img
              v-if="character.coverUrl"
              :src="character.coverUrl"
              :alt="character.name"
              class="relative z-1 h-full w-full scale-300 object-contain transition duration-300 ease-in-out group-hover:scale-350"
            >
          </div>
        </article>
      </section>
      </template>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  title: NSFW Explore
</route>
