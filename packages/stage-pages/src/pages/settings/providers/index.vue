<script setup lang="ts">
import type { ProviderDeployment, ProviderPricing } from '@proj-airi/stage-ui/libs/providers/attributes'
import type { Ref } from 'vue'

import { isCustomProvidersDisabled } from '@proj-airi/stage-shared'
import { IconStatusItem, RippleGrid } from '@proj-airi/stage-ui/components'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useRippleGridState } from '@proj-airi/stage-ui/composables/use-ripple-grid-state'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { GhostButton, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

interface ProviderSourceCard {
  id: string
  category: string
  to?: string
  icon?: string
  iconColor?: string
  iconImage?: string
  name?: string
  description?: string
  localizedName?: string
  localizedDescription?: string
  configured?: boolean
  pricing?: ProviderPricing
  deployment?: ProviderDeployment
  beginnerRecommended?: boolean
}

interface ProviderBlockConfig {
  id: string
  icon: string
  title: string
  description: string
  providersRef: Readonly<Ref<ProviderSourceCard[]>>
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const providersStore = useProviderStore()
const providerConfigStore = useProviderConfigStore()
const artistryStore = useArtistryStore()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()
const { trackProviderClick } = useAnalytics()

const {
  allChatProvidersMetadata,
  allAudioSpeechProvidersMetadata,
  allAudioTranscriptionProvidersMetadata,
  allVisionProvidersMetadata,
} = storeToRefs(providersStore)
const { replicaSyncState } = storeToRefs(providerConfigStore)

const allArtistryProvidersMetadata = computed<ProviderSourceCard[]>((): ProviderSourceCard[] => {
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
    ...(isCustomProvidersDisabled()
      ? []
      : ([
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
            iconImage: undefined,
          },
        ] satisfies ProviderSourceCard[])),
  ]
})

const providerBlocksConfig: ProviderBlockConfig[] = [
  {
    id: 'chat',
    icon: 'i-solar:chat-square-like-bold-duotone',
    title: t('settings.pages.providers.categories.chat.title'),
    description: t('settings.pages.providers.categories.chat.description'),
    providersRef: allChatProvidersMetadata,
  },
  {
    id: 'vision',
    icon: 'i-solar:eye-bold-duotone',
    title: t('settings.pages.providers.categories.vision.title'),
    description: t('settings.pages.providers.categories.vision.description'),
    providersRef: allVisionProvidersMetadata,
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
        .filter((p) => {
          if (p.id === 'speech-noop')
            return false
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
    <div
      :class="[
        'bg-primary-500/10 dark:bg-primary-800/25 rounded-lg p-4',
      ]"
    >
      <div
        :class="[
          'mb-2 text-xl font-normal text-primary-800 dark:text-primary-100',
        ]"
      >
        {{ $t('settings.pages.providers.helpinfo.title') }}
      </div>
      <div
        :class="[
          'text-primary-700 dark:text-primary-300',
        ]"
      >
        <i18n-t keypath="settings.pages.providers.helpinfo.description">
          <template #chat>
            <div
              :class="[
                'bg-primary-500/10 dark:bg-primary-800/25 inline-flex items-center gap-1',
                'rounded-lg px-2 py-0.5 translate-y-[0.25lh]',
              ]"
            >
              <div
                :class="[
                  'i-solar:chat-square-like-bold-duotone',
                ]"
              />
              <strong
                :class="[
                  'font-normal',
                ]"
              >Chat</strong>
            </div>
          </template>
        </i18n-t>
      </div>
    </div>

    <!-- Tabs Container -->
    <div
      :class="[
        'flex flex-row flex-wrap gap-2 pb-2',
      ]"
    >
      <GhostButton
        v-for="block in providerBlocksConfig"
        :key="block.id"
        type="button"
        size="unset"
        :active="activeTabId === block.id"
        :aria-pressed="activeTabId === block.id"
        :class="['gap-2 rounded-xl! px-4 py-2']"
        @click="setActiveTab(block.id)"
      >
        <div
          :class="[
            'text-xl',
            (block.icon),
          ]"
        />
        {{ block.title }}
      </GhostButton>
    </div>

    <!-- Filters Container -->
    <div
      :class="[
        'flex flex-row items-center gap-4 flex-wrap',
        'pb-2 text-xs',
      ]"
    >
      <div
        :class="[
          'flex flex-row items-center gap-2',
        ]"
      >
        <span
          :class="[
            'text-neutral-400 dark:text-neutral-500 font-medium',
          ]"
        >{{ $t('settings.pages.providers.filters.pricing') }}:</span>
        <SelectTab
          v-model="filterPricing"
          :aria-label="$t('settings.pages.providers.filters.pricing')"
          :options="[{ value: 'all', label: $t('settings.pages.providers.filters.all') }, { value: 'free', label: $t('settings.pages.providers.filters.free') }, { value: 'paid', label: $t('settings.pages.providers.filters.paid') }]"
          size="xs"
          tab-space="compact"
        />
      </div>

      <div
        :class="[
          'flex flex-row items-center gap-2',
        ]"
      >
        <span
          :class="[
            'text-neutral-400 dark:text-neutral-500 font-medium',
          ]"
        >{{ $t('settings.pages.providers.filters.deployment') }}:</span>
        <SelectTab
          v-model="filterDeployment"
          :aria-label="$t('settings.pages.providers.filters.deployment')"
          :options="[{ value: 'all', label: $t('settings.pages.providers.filters.all') }, { value: 'local', label: $t('settings.pages.providers.filters.local') }, { value: 'cloud', label: $t('settings.pages.providers.filters.cloud') }]"
          size="xs"
          tab-space="compact"
        />
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
        <div
          :class="[
            'flex flex-row items-center gap-2',
          ]"
        >
          <div
            :id="block.id"
            :class="[
              'text-neutral-500 dark:text-neutral-400 text-4xl',
              (block.icon),
            ]"
          />
          <div>
            <div>
              <span
                :class="[
                  'text-neutral-300 dark:text-neutral-500 text-sm sm:text-base',
                ]"
              >{{ block.description }}</span>
            </div>
            <div
              :class="[
                'flex text-nowrap text-2xl sm:text-3xl font-normal',
              ]"
            >
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
          :to="provider.to ?? `/settings/providers/${provider.category}/${provider.id}`"
          :configured="provider.configured"
          :sync-state="replicaSyncState[provider.id]"
          :pricing="provider.pricing"
          :deployment="provider.deployment"
          :beginner-recommended="provider.beginnerRecommended"
          @click="trackProviderClick(provider.id, provider.category)"
        />
      </template>
    </RippleGrid>
  </div>
  <div
    v-motion
    :class="[
      'text-neutral-500/5 dark:text-neutral-600/20 pointer-events-none fixed top-[calc(100dvh-15rem)]',
      'bottom-0 right--5 z--1 size-60 flex',
      'items-center justify-center',
    ]"

    :initial="{ scale: 0.9, opacity: 0, y: 20 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
  >
    <div
      :class="[
        'text-60 i-solar:box-minimalistic-bold-duotone',
      ]"
    />
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
