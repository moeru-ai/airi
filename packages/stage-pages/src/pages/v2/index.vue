<script setup lang="ts">
import { CharacterCard } from '@proj-airi/stage-ui/components/characters/index'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useCharacterStore } from '@proj-airi/stage-ui/stores/characters'
import { GhostButton } from '@proj-airi/ui'
import { computed, onMounted } from 'vue'

const characterStore = useCharacterStore()
const authStore = useAuthStore()

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

const characters = computed(() => Array.from(characterStore.characters.values()).map((char) => {
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
    liked: char.likes?.some(l => l.userId === authStore.user?.id),
    bookmarked: char.bookmarks?.some(b => b.userId === authStore.user?.id),
    priceCredit: char.priceCredit,
  }
}))
</script>

<template>
  <div :class="['min-h-screen w-full']">
    <div :class="['mt-10 grid gap-6', 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5']">
      <CharacterCard
        v-for="character in characters"
        :key="character.id"
        :name="character.name"
        :description="character.tagline"
        :cover-url="character.coverUrl"
        :cover-background-url="character.coverBackgroundUrl"
        :avatar-url="character.characterAvatarUrl"
        :class="['[&_.character-card-buttons-more]:opacity-0 [&_.character-card-buttons-more]:hover:opacity-100 [&_.character-card-buttons-more]:focus-visible:opacity-100']"
      >
        <template #cover-actions>
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
        </template>
        <template #meta>
          <GhostButton size="sm" aria-label="Connect">
            <span :class="['i-tabler:coins']" aria-hidden="true" />
            <span :class="['text-xs']">{{ formatCount(character.priceCredit) }}</span>
          </GhostButton>
        </template>
        <template #footer>
          <div :class="['grid grid-cols-3 items-center']">
            <div :class="['flex items-center justify-start']">
              <GhostButton size="sm" aria-label="Bookmark" @click="characterStore.bookmark(character.id)">
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
              </GhostButton>
            </div>
            <div :class="['flex items-center justify-center']">
              <GhostButton size="sm" aria-label="Like" @click="characterStore.like(character.id)">
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
              </GhostButton>
            </div>
            <div :class="['flex items-center justify-end']">
              <div
                :class="[
                  'flex flex-row items-center gap-1',
                  'pl-1.5 pr-2 py-1 rounded-full',
                  'bg-neutral-900/50',
                ]"
              >
                <div
                  :class="[
                    'i-ph:plus-bold',
                    'text-xs inline-block',
                    'text-neutral-100 dark:text-neutral-900',
                  ]"
                />
                <span
                  :class="[
                    'text-xs',
                    'text-neutral-100 dark:text-neutral-900',
                  ]"
                >
                  Chat
                </span>
              </div>
            </div>
          </div>
        </template>
      </CharacterCard>
    </div>
  </div>
</template>
