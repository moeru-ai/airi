<script setup lang="ts">
import { Button } from '@proj-airi/ui'

const coverImage = new URL('../../../../stage-ui/src/components/menu/relu.avif', import.meta.url).href
const characterWithBackgroundBackgroundImage = new URL('../../../../../docs/.vitepress/assets/home-cover-2025-12-24-bg.avif', import.meta.url).href
const characterWithBackgroundAvatar = new URL('../../../../../docs/.vitepress/assets/home-cover-2025-12-24.avif', import.meta.url).href
const characterAvatarImage = new URL('../../../../stage-ui/src/assets/live2d/models/hiyori/preview.png', import.meta.url).href

function formatCount(value: number) {
  const units = [
    { suffix: 'Q', value: 1_000_000_000_000_000 },
    { suffix: 'T', value: 1_000_000_000_000 },
    { suffix: 'B', value: 1_000_000_000 },
    { suffix: 'M', value: 1_000_000 },
    { suffix: 'K', value: 1_000 },
  ]

  for (const unit of units) {
    if (value >= unit.value) {
      const scaled = value / unit.value
      const digits = scaled >= 10 ? 0 : 1
      return `${scaled.toFixed(digits)}${unit.suffix}`
    }
  }

  return value.toString()
}

const characters = [
  {
    id: 'nyx-001',
    name: 'Aster Nyx',
    tagline: 'Solar striker with a radiant core.',
    creator: 'Kara Lin',
    creatorRole: 'Concept Artist',
    avatarUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80',
    characterAvatarUrl: characterWithBackgroundAvatar,
    coverUrl: characterWithBackgroundAvatar,
    coverBackgroundUrl: characterWithBackgroundBackgroundImage,
    usedBy: 24891,
    interactions: 482000,
    likes: 94000,
    bookmarks: 12000,
    forks: 1840,
    liked: true,
    bookmarked: false,
    priceCredit: 49,
    accent: {
      ring: 'ring-amber-400/60',
      chip: 'bg-amber-400/20 text-amber-100',
      glow: 'bg-amber-400/20',
      text: 'text-amber-200',
    },
  },
  {
    id: 'vale-008',
    name: 'Mira Vale',
    tagline: 'Glacial tactician who remains calm under pressure, analyzing every battlefield with precision and executing strategies that turn the tide of combat through calculated frost manipulation.',
    creator: 'Evan Wu',
    creatorRole: 'Gameplay Designer',
    avatarUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=200&q=80',
    characterAvatarUrl: characterAvatarImage,
    coverUrl: coverImage,
    usedBy: 17210,
    interactions: 361000,
    likes: 68300,
    bookmarks: 9200,
    forks: 1320,
    liked: false,
    bookmarked: true,
    priceCredit: 0,
    accent: {
      ring: 'ring-cyan-400/60',
      chip: 'bg-cyan-400/20 text-cyan-100',
      glow: 'bg-cyan-400/20',
      text: 'text-cyan-200',
    },
  },
  {
    id: 'sable-014',
    name: 'Rook Sable',
    tagline: 'Umbral runner who moves before you blink.',
    creator: 'Nina Park',
    creatorRole: 'Rigger',
    avatarUrl: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=200&q=80',
    characterAvatarUrl: characterAvatarImage,
    coverUrl: coverImage,
    usedBy: 31400,
    interactions: 509500,
    likes: 118200,
    bookmarks: 19200,
    forks: 2650,
    liked: true,
    bookmarked: true,
    priceCredit: 49,
    accent: {
      ring: 'ring-fuchsia-400/60',
      chip: 'bg-fuchsia-400/20 text-fuchsia-100',
      glow: 'bg-fuchsia-400/20',
      text: 'text-fuchsia-200',
    },
  },
  {
    id: 'sol-021',
    name: 'Iri Sol',
    tagline: 'Storm weaver with precision control.',
    creator: 'Daisuke Ito',
    creatorRole: 'Tech Artist',
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80',
    characterAvatarUrl: characterAvatarImage,
    coverUrl: coverImage,
    usedBy: 20980000000000000,
    interactions: 2984000000000000,
    likes: 64300,
    bookmarks: 870000000,
    forks: 1150,
    liked: false,
    bookmarked: false,
    priceCredit: 49,
    accent: {
      ring: 'ring-sky-400/60',
      chip: 'bg-sky-400/20 text-sky-100',
      glow: 'bg-sky-400/20',
      text: 'text-sky-200',
    },
  },
  {
    id: 'rin-034',
    name: 'Kael Rin of the Earthbound Vanguard',
    tagline: 'Terra guardian, resilient and steady.',
    creator: 'Mara Voss',
    creatorRole: 'Animator',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    characterAvatarUrl: characterAvatarImage,
    coverUrl: coverImage,
    usedBy: 15860,
    interactions: 244200,
    likes: 51400,
    bookmarks: 6900,
    forks: 940,
    liked: false,
    bookmarked: true,
    priceCredit: 49,
    accent: {
      ring: 'ring-emerald-400/60',
      chip: 'bg-emerald-400/20 text-emerald-100',
      glow: 'bg-emerald-400/20',
      text: 'text-emerald-200',
    },
  },
  {
    id: 'lux-047',
    name: 'Nova Lux',
    tagline: 'Astral support, lifts the whole squad.',
    creator: 'Yuki Tan',
    creatorRole: 'Illustrator',
    avatarUrl: 'https://images.unsplash.com/photo-1525134479668-1bee5c7c6845?auto=format&fit=crop&w=200&q=80',
    characterAvatarUrl: characterAvatarImage,
    coverUrl: coverImage,
    usedBy: 11420,
    interactions: 189000,
    likes: 40200,
    bookmarks: 5400,
    forks: 680,
    liked: true,
    bookmarked: false,
    priceCredit: 49,
    accent: {
      ring: 'ring-rose-400/60',
      chip: 'bg-rose-400/20 text-rose-100',
      glow: 'bg-rose-400/20',
      text: 'text-rose-200',
    },
  },
]
</script>

<template>
  <div :class="['min-h-screen w-full']">
    <div>
      <div :class="['mt-10 grid gap-6', 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5']">
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
                <div :class="['flex-1 text-xs text-ellipsis text-neutral-500 line-clamp-3 max-h-[3rem] overflow-hidden']">
                  {{ character.tagline }}
                </div>
                <div :class="['grid grid-cols-3 items-center']">
                  <div :class="['flex items-center justify-start']">
                    <Button variant="ghost" size="sm" aria-label="Bookmark">
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
                    <Button variant="ghost" size="sm" aria-label="Like">
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
