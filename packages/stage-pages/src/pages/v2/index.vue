<script setup lang="ts">
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useCharacterStore } from '@proj-airi/stage-ui/stores/characters'
import { Button } from '@proj-airi/ui'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const characterStore = useCharacterStore()
const authStore = useAuthStore()
const router = useRouter()
const activeFilter = ref<'all' | 'companion' | 'romance' | 'roleplay' | 'nsfw'>('all')

const coverImage = new URL('../../../../stage-ui/src/components/menu/relu.avif', import.meta.url).href
const characterAvatarImage = new URL('../../../../stage-ui/src/assets/live2d/models/hiyori/preview.png', import.meta.url).href

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
  router.push(`/v2/${id}`)
}

const characters = computed(() => Array.from(characterStore.characters.values())
  .filter((char) => {
    if (activeFilter.value === 'all')
      return true
    if (activeFilter.value === 'nsfw')
      return char.nsfwEnabled
    return char.relationshipMode === activeFilter.value
  })
  .map((char) => {
    const i18n = char.i18n?.[0] || { name: 'Unknown', tagline: '', description: '' }

    return {
      id: char.id,
      name: i18n.name,
      tagline: i18n.tagline || i18n.description,
      avatarUrl: char.avatarUrl || 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80',
      characterAvatarUrl: char.characterAvatarUrl || characterAvatarImage,
      coverUrl: char.coverUrl || coverImage,
      coverBackgroundUrl: char.coverBackgroundUrl,
      usedBy: char.interactionsCount,
      interactions: char.interactionsCount,
      likes: char.likesCount,
      bookmarks: char.bookmarksCount,
      forks: char.forksCount,
      visibility: char.visibility,
      nsfwEnabled: char.nsfwEnabled,
      nsfwLevel: char.nsfwLevel,
      relationshipMode: char.relationshipMode,
      personality: char.personaProfile?.personality,
      scenario: char.personaProfile?.scenario,
      liked: char.likes?.some(l => l.userId === authStore.user?.id),
      bookmarked: char.bookmarks?.some(b => b.userId === authStore.user?.id),
      priceCredit: char.priceCredit,
    }
  }))

const filters = [
  { id: 'all', label: 'All' },
  { id: 'companion', label: 'Companion' },
  { id: 'romance', label: 'Romance' },
  { id: 'roleplay', label: 'Roleplay' },
  { id: 'nsfw', label: 'NSFW' },
] as const
</script>

<template>
  <div :class="['min-h-screen w-full px-4 py-8 md:px-8']">
    <div mx-auto max-w-7xl>
      <section class="bg-linear-to-br relative overflow-hidden rounded-[2rem] from-rose-50 via-white to-amber-50 px-6 py-8 shadow-sm ring-1 ring-neutral-200/70 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 md:px-10 md:py-12 dark:ring-neutral-800">
        <div class="absolute right--10 top--10 h-56 w-56 rounded-full bg-rose-300/20 blur-3xl dark:bg-rose-500/10" />
        <div class="absolute bottom--14 left-10 h-48 w-48 rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-500/10" />
        <div relative z-1 max-w-3xl>
          <div class="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs text-neutral-600 font-medium backdrop-blur dark:bg-neutral-800/80 dark:text-neutral-300">
            <div class="i-solar:hearts-line-duotone text-sm text-rose-500" />
            Explore companions, romance, and roleplay personas
          </div>
          <h1 class="max-w-2xl text-4xl text-neutral-950 font-semibold leading-tight md:text-5xl dark:text-white">
            Find a companion that actually feels intentional
          </h1>
          <p class="mt-4 max-w-2xl text-sm text-neutral-600 leading-6 md:text-base dark:text-neutral-300">
            Browse character profiles, compare dynamics, and jump into companions built for companionship, romance, or fantasy roleplay instead of generic chatbot cards.
          </p>
          <div class="mt-6 flex flex-wrap gap-2">
            <button
              v-for="filter in filters"
              :key="filter.id"
              class="rounded-full px-4 py-2 text-sm font-medium transition-all"
              :class="activeFilter === filter.id
                ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                : 'bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-700 dark:hover:bg-neutral-800'"
              @click="activeFilter = filter.id"
            >
              {{ filter.label }}
            </button>
          </div>
        </div>
      </section>

      <div class="grid mt-8 gap-6 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2 xl:grid-cols-5">
        <article
          v-for="character in characters"
          :key="character.id"
          :class="[
            'group relative rounded-3xl overflow-hidden',
            'shadow-sm',
            '[&_.character-card-buttons-more]:opacity-0 [&_.character-card-buttons-more]:hover:opacity-100',
            'aspect-[12/19]',
          ]"
        >
          <div :class="['relative overflow-hidden w-full h-70% rounded-2xl']">
            <img
              v-if="character.coverBackgroundUrl"
              :src="character.coverBackgroundUrl"
              :alt="character.name"
              :class="[
                'absolute inset-0 z-5',
                'w-full h-full',
                'object-cover',
              ]"
            >
            <div
              v-else
              :class="[
                'absolute inset-0 z-5',
                'w-full h-full',
                'bg-white',
              ]"
            />
            <img
              :src="character.coverUrl"
              :alt="character.name"
              :class="[
                'absolute left-0 top-0 z-5',
                'h-full w-full',
                'object-cover',
                'transition duration-300 ease-in-out',
              ]"
            >
            <!-- Dropdown -->
            <button
              type="button"
              :class="[
                'character-card-buttons-more',
                'absolute right-3 top-3 z-6',
                'h-7 w-7',
                'flex items-center justify-center',
                'rounded-lg backdrop-blur-sm',
                'text-white',
                'bg-neutral-900/30 hover:bg-neutral-900/45 active:bg-neutral-900/60',
                'dark:bg-neutral-950/50 hover:dark:bg-neutral-900/65 active:dark:bg-neutral-900/90',
                'transition duration-200 ease-in-out',
              ]"
              aria-label="Options for character"
            >
              <div :class="['i-solar-menu-dots-bold inline-block']" />
            </button>

            <!-- <div :class="['absolute top-3 left-3 flex justify-end z-8']">
              <div :class="['flex items-center gap-3', 'rounded-full bg-white/85 px-3 py-1', 'text-[11px] text-primary-600 backdrop-blur']">
                <div :class="['flex items-center gap-1.5']">
                  <div :class="['i-solar-download-line-duotone text-sm text-primary-600 inline-block']" />
                  <span :class="['text-primary-600']">{{ formatCount(character.usedBy) }}</span>
                </div>
                <div :class="['flex items-center gap-1.5']">
                  <div :class="['i-solar-chat-square-arrow-linear text-sm text-primary-600 inline-block']" />
                  <span :class="['text-primary-600']">{{ formatCount(character.interactions) }}</span>
                </div>
              </div>
            </div> -->
          </div>

          <div :class="['relative z-7 overflow-hidden h-30%']">
            <div class="relative z-1 h-full">
              <div class="relative h-full flex flex-col justify-between gap-2 px-3 pb-3 pt-2">
                <div :class="['flex items-center justify-between gap-3']">
                  <div :class="['flex items-center gap-2']">
                    <img
                      :src="character.characterAvatarUrl"
                      :alt="character.name"
                      :class="['h-7 w-7 rounded-full object-cover']"
                    >
                    <div :class="['text-lg font-semibold line-clamp-1']">
                      {{ character.name }}
                    </div>
                  </div>
                  <button
                    aria-label="Connect"
                    :class="[
                      'px-2 py-1 flex flex-row items-center gap-1',
                    ]"
                  >
                    <div class="flex flex items-center gap-1">
                      <div i-tabler:coins />
                      <div :class="['text-xs']">
                        {{ formatCount(character.priceCredit) }}
                      </div>
                    </div>
                  </button>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <span class="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600 font-medium tracking-wide uppercase dark:bg-neutral-800 dark:text-neutral-300">
                    {{ character.relationshipMode }}
                  </span>
                  <span
                    v-if="character.nsfwEnabled"
                    class="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700 font-medium tracking-wide uppercase dark:bg-rose-500/15 dark:text-rose-300"
                  >
                    {{ character.nsfwLevel }}
                  </span>
                  <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 font-medium tracking-wide uppercase dark:bg-amber-500/15 dark:text-amber-300">
                    {{ character.visibility }}
                  </span>
                </div>
                <div :class="['flex-1 text-xs text-ellipsis text-neutral-500 line-clamp-3 max-h-[3rem] overflow-hidden']">
                  {{ character.personality || character.scenario || character.tagline }}
                </div>
                <div :class="['grid grid-cols-3 items-center']">
                  <div :class="['flex items-center justify-start']">
                    <Button variant="ghost" size="sm" aria-label="Bookmark" @click="characterStore.bookmark(character.id)">
                      <div
                        :class="[
                          character.bookmarked ? 'i-solar-star-bold' : 'i-solar-star-linear',
                          'text-base inline-block',
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
                  <div :class="['flex items-center justify-center']">
                    <Button variant="ghost" size="sm" aria-label="Like" @click="characterStore.like(character.id)">
                      <div
                        :class="[
                          character.liked ? 'i-solar-heart-bold' : 'i-solar-heart-outline',
                          'text-base inline-block',
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
                  <div :class="['flex items-center justify-end']">
                    <button
                      type="button"
                      :class="[
                        'flex flex-row items-center gap-1',
                        'pl-1.5 pr-2 py-1 rounded-full',
                        'bg-neutral-900/50',
                      ]"
                      @click="openCharacter(character.id)"
                    >
                      <div :class="['i-solar:chat-square-bold text-xs inline-block text-neutral-100 dark:text-neutral-900']" />
                      <span :class="['text-xs', 'text-neutral-100 dark:text-neutral-900']">Open</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div :class="['absolute left-0 top-0 z-0 w-full h-full']">
            <div :class="['absolute inset-0 z-2 bg-white/70 backdrop-blur-lg w-full h-full']" />
            <img
              :src="character.coverUrl"
              :alt="character.name"
              :class="[
                'relative z-1',
                'h-full w-full',
                'object-contain',
                'transition duration-300 ease-in-out',
                'scale-300 group-hover:scale-350',
              ]"
            >
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
