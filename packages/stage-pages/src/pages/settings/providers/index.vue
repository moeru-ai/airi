<script setup lang="ts">
import { IconStatusItem, RippleGrid } from '@proj-airi/stage-ui/components'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useRippleGridState } from '@proj-airi/stage-ui/composables/use-ripple-grid-state'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const providersStore = useProvidersStore()
const artistryStore = useArtistryStore()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()
const { trackProviderClick } = useAnalytics()

const {
  allChatProvidersMetadata,
  allAudioSpeechProvidersMetadata,
  allAudioTranscriptionProvidersMetadata,
} = storeToRefs(providersStore)

const allArtistryProvidersMetadata = computed(() => {
  return [
    {
      id: 'comfyui',
      category: 'artistry',
      icon: 'i-solar:gallery-bold-duotone',
      iconColor: 'text-indigo-500',
      name: 'ComfyUI',
      localizedName: 'ComfyUI',
      description: t('settings.pages.providers.categories.artistry.items.comfyui.description'),
      localizedDescription: t('settings.pages.providers.categories.artistry.items.comfyui.description'),
      configured: !!artistryStore.comfyuiServerUrl,
      to: '/settings/providers/artistry/comfyui',
      pricing: 'free',
      deployment: 'local',
      beginnerRecommended: true,
      iconImage: undefined,
    },
    {
      id: 'replicate',
      category: 'artistry',
      icon: 'i-lobe-icons:replicate',
      iconColor: 'i-lobe-icons:replicate-color',
      name: 'Replicate',
      localizedName: 'Replicate',
      description: t('settings.pages.providers.categories.artistry.items.replicate.description'),
      localizedDescription: t('settings.pages.providers.categories.artistry.items.replicate.description'),
      configured: !!artistryStore.replicateApiKey,
      to: '/settings/providers/artistry/replicate',
      pricing: 'paid',
      deployment: 'cloud',
      beginnerRecommended: false,
      iconImage: undefined,
    },
    {
      id: 'nanobanana',
      category: 'artistry',
      icon: 'i-solar:gallery-round-bold-duotone',
      iconColor: 'text-amber-500',
      name: 'Nano Banana',
      localizedName: 'Nano Banana',
      description: t('settings.pages.providers.categories.artistry.items.nanobanana.description'),
      localizedDescription: t('settings.pages.providers.categories.artistry.items.nanobanana.description'),
      configured: !!artistryStore.nanobananaApiKey,
      to: '/settings/providers/artistry/nanobanana',
      pricing: 'free',
      deployment: 'cloud',
      beginnerRecommended: false,
      iconImage: undefined,
    },
  ]
})

const providerBlocksConfig = [
  {
    id: 'chat',
    icon: 'i-solar:chat-square-like-bold-duotone',
    title: t('settings.pages.providers.categories.chat.title'),
    description: t('settings.pages.providers.categories.chat.description'),
    providersRef: allChatProvidersMetadata,
  },
  {
    id: 'speech',
    icon: 'i-solar:user-speak-rounded-bold-duotone',
    title: t('settings.pages.providers.categories.speech.title'),
    description: t('settings.pages.providers.categories.speech.description'),
    providersRef: allAudioSpeechProvidersMetadata,
  },
  {
    id: 'transcription',
    icon: 'i-solar:microphone-3-bold-duotone',
    title: t('settings.pages.providers.categories.transcription.title'),
    description: t('settings.pages.providers.categories.transcription.description'),
    providersRef: allAudioTranscriptionProvidersMetadata,
  },
  {
    id: 'artistry',
    icon: 'i-solar:palette-bold-duotone',
    title: t('settings.pages.providers.categories.artistry.title'),
    description: t('settings.pages.providers.categories.artistry.description'),
    providersRef: allArtistryProvidersMetadata,
  },
]

const activeTabId = ref(providerBlocksConfig[0].id)
const filterPricing = ref<'all' | 'free' | 'paid'>('all')
const filterDeployment = ref<'all' | 'local' | 'cloud'>('all')

onMounted(() => {
  if (route.hash) {
    const hashId = route.hash.replace('#', '')
    if (providerBlocksConfig.some(b => b.id === hashId)) {
      activeTabId.value = hashId
    }
  }
})

function setActiveTab(id: string) {
  activeTabId.value = id
  filterPricing.value = 'all'
  filterDeployment.value = 'all'
  router.replace({ hash: `#${id}` }).catch(() => {})
}

const providerBlocks = computed(() => {
  let globalIndex = 0
  return providerBlocksConfig
    .filter(block => block.id === activeTabId.value)
    .map((block) => {
      const filteredProviders = block.providersRef.value
        .filter((p: any) => {
          if (filterPricing.value !== 'all' && p.pricing !== filterPricing.value)
            return false
          if (filterDeployment.value !== 'all' && p.deployment !== filterDeployment.value)
            return false
          return true
        })
        .map(provider => ({
          ...provider,
          renderIndex: globalIndex++,
        }))

      return {
        id: block.id,
        icon: block.icon,
        title: block.title,
        description: block.description,
        providers: filteredProviders,
      }
    })
})
</script>

<template>
  <div :class="['mb-6', 'flex', 'flex-col', 'gap-5', 'pb-10']">
    <div bg="primary-500/10 dark:primary-800/25" rounded-lg p-4>
      <div mb-2 text-xl font-normal text="primary-800 dark:primary-100">
        {{ $t('settings.pages.providers.helpinfo.title') }}
      </div>
      <div text="primary-700 dark:primary-300">
        <i18n-t keypath="settings.pages.providers.helpinfo.description">
          <template #chat>
            <div bg="primary-500/10 dark:primary-800/25" inline-flex items-center gap-1 rounded-lg px-2 py-0.5 translate-y="[0.25lh]">
              <div i-solar:chat-square-like-bold-duotone />
              <strong class="font-normal">Chat</strong>
            </div>
          </template>
        </i18n-t>
      </div>
    </div>

    <!-- Tabs Container -->
    <div class="flex flex-row flex-wrap gap-2 pb-2">
      <button
        v-for="block in providerBlocksConfig"
        :key="block.id"
        class="flex items-center gap-2 rounded-xl px-4 py-2 outline-none transition-colors duration-200"
        :class="activeTabId === block.id ? 'bg-primary-500/15 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300 font-semibold' : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400'"
        @click="setActiveTab(block.id)"
      >
        <div :class="block.icon" class="text-xl" />
        {{ block.title }}
      </button>
    </div>

    <!-- Filters Container -->
    <div flex="~ row items-center gap-4 wrap" pb-2 text-xs>
      <div flex="~ row items-center gap-2">
        <span text="neutral-400 dark:neutral-500" font-medium>{{ $t('settings.pages.providers.filters.pricing') }}:</span>
        <div flex="~ row items-center gap-1" bg="neutral-100 dark:neutral-800" rounded-lg p-0.5>
          <button
            v-for="opt in ['all', 'free', 'paid'] as const"
            :key="opt"
            rounded-md px-2 py-0.5 transition-all
            :class="filterPricing === opt ? 'bg-white dark:bg-neutral-700 shadow-sm text-primary-600 dark:text-primary-400 font-semibold' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'"
            @click="filterPricing = opt"
          >
            {{ $t(`settings.pages.providers.filters.${opt}`) }}
          </button>
        </div>
      </div>

      <div flex="~ row items-center gap-2">
        <span text="neutral-400 dark:neutral-500" font-medium>{{ $t('settings.pages.providers.filters.deployment') }}:</span>
        <div flex="~ row items-center gap-1" bg="neutral-100 dark:neutral-800" rounded-lg p-0.5>
          <button
            v-for="opt in ['all', 'local', 'cloud'] as const"
            :key="opt"
            rounded-md px-2 py-0.5 transition-all
            :class="filterDeployment === opt ? 'bg-white dark:bg-neutral-700 shadow-sm text-primary-600 dark:text-primary-400 font-semibold' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'"
            @click="filterDeployment = opt"
          >
            {{ $t(`settings.pages.providers.filters.${opt}`) }}
          </button>
        </div>
      </div>
    </div>

    <RippleGrid
      :sections="providerBlocks"
      :get-items="block => block.providers"
      :columns="{ default: 1, sm: 2, xl: 3 }"
      :origin-index="lastClickedIndex"
      @item-click="({ globalIndex }) => setLastClickedIndex(globalIndex)"
    >
      <template #header="{ section: block }">
        <div flex="~ row items-center gap-2">
          <div :id="block.id" :class="block.icon" text="neutral-500 dark:neutral-400 4xl" />
          <div>
            <div>
              <span text="neutral-300 dark:neutral-500 sm sm:base">{{ block.description }}</span>
            </div>
            <div flex text-nowrap text="2xl sm:3xl" font-normal>
              <div>
                {{ block.title }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #item="{ item: provider }">
        <IconStatusItem
          :title="provider.localizedName || 'Unknown'"
          :description="provider.localizedDescription"
          :icon="provider.icon"
          :icon-color="provider.iconColor"
          :icon-image="provider.iconImage"
          :to="`/settings/providers/${provider.category}/${provider.id}`"
          :configured="provider.configured"
          :pricing="provider.pricing as any"
          :deployment="provider.deployment as any"
          :beginner-recommended="provider.beginnerRecommended"
          @click="trackProviderClick(provider.id, provider.category)"
        />
      </template>
    </RippleGrid>
  </div>
  <div
    v-motion
    text="neutral-500/5 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 20 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:box-minimalistic-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.providers.description
  icon: i-solar:box-minimalistic-bold-duotone
  settingsEntry: true
  order: 6
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
