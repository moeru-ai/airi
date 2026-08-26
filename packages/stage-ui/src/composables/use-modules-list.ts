import type { BeatSyncDetectorState } from '@proj-airi/stage-shared/beat-sync'

import { getBeatSyncState, isBeatSyncSupported, listenBeatSyncStateChange } from '@proj-airi/stage-shared/beat-sync'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import factorioIcon from '../assets/factorio-simple.png'

import { useArtistryStore } from '../stores/modules/artistry'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useDiscordStore } from '../stores/modules/discord'
import { useFactorioStore } from '../stores/modules/gaming-factorio'
import { useMinecraftStore } from '../stores/modules/gaming-minecraft'
import { useHearingStore } from '../stores/modules/hearing'
import { useSpeechStore } from '../stores/modules/speech'
import { useTwitterStore } from '../stores/modules/twitter'
import { useVisionStore } from '../stores/modules/vision'
import { useWebSearchStore } from '../stores/modules/web-search'

export interface Module {
  category: string
  configured: boolean
  description: string
  icon?: string
  iconColor?: string
  iconImage?: string
  id: string
  name: string
  to: string
}

export function useModulesList() {
  const { t } = useI18n()

  // Initialize stores
  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const hearingStore = useHearingStore()
  const visionStore = useVisionStore()
  const discordStore = useDiscordStore()
  const twitterStore = useTwitterStore()
  const webSearchStore = useWebSearchStore()
  const minecraftStore = useMinecraftStore()
  const factorioStore = useFactorioStore()
  const artistryStore = useArtistryStore()
  const beatSyncState = ref<BeatSyncDetectorState>()
  const beatSyncSupported = isBeatSyncSupported()

  minecraftStore.initialize()

  const modulesList = computed<Module[]>(() => [
    {
      category: 'essential',
      configured: consciousnessStore.configured,
      description: t('settings.pages.modules.consciousness.description'),
      icon: 'i-solar:ghost-bold-duotone',
      id: 'consciousness',
      name: t('settings.pages.modules.consciousness.title'),
      to: '/settings/modules/consciousness',
    },
    {
      category: 'essential',
      configured: speechStore.configured,
      description: t('settings.pages.modules.speech.description'),
      icon: 'i-solar:user-speak-rounded-bold-duotone',
      id: 'speech',
      name: t('settings.pages.modules.speech.title'),
      to: '/settings/modules/speech',
    },
    {
      category: 'essential',
      configured: hearingStore.configured,
      description: t('settings.pages.modules.hearing.description'),
      icon: 'i-solar:microphone-3-bold-duotone',
      id: 'hearing',
      name: t('settings.pages.modules.hearing.title'),
      to: '/settings/modules/hearing',
    },
    {
      category: 'essential',
      configured: visionStore.configured,
      description: t('settings.pages.modules.vision.description'),
      icon: 'i-solar:eye-closed-bold-duotone',
      id: 'vision',
      name: t('settings.pages.modules.vision.title'),
      to: '/settings/modules/vision',
    },
    {
      category: 'essential',
      configured: webSearchStore.configured,
      description: t('settings.pages.modules.web-search.description'),
      icon: 'i-solar:magnifer-bold-duotone',
      id: 'web-search',
      name: t('settings.pages.modules.web-search.title'),
      to: '/settings/modules/web-search',
    },
    {
      category: 'essential',
      configured: artistryStore.configured,
      description: t('settings.pages.modules.artistry.description'),
      icon: 'i-solar:palette-bold-duotone',
      id: 'artistry',
      name: t('settings.pages.modules.artistry.title'),
      to: '/settings/modules/artistry',
    },
    {
      category: 'essential',
      configured: false,
      description: t('settings.pages.modules.memory-short-term.description'),
      icon: 'i-solar:bookmark-bold-duotone',
      id: 'memory-short-term',
      name: t('settings.pages.modules.memory-short-term.title'),
      to: '/settings/modules/memory-short-term',
    },
    {
      category: 'essential',
      configured: false,
      description: t('settings.pages.modules.memory-long-term.description'),
      icon: 'i-solar:book-bookmark-bold-duotone',
      id: 'memory-long-term',
      name: t('settings.pages.modules.memory-long-term.title'),
      to: '/settings/modules/memory-long-term',
    },
    {
      category: 'messaging',
      configured: discordStore.configured,
      description: t('settings.pages.modules.messaging-discord.description'),
      icon: 'i-simple-icons:discord',
      id: 'messaging-discord',
      name: t('settings.pages.modules.messaging-discord.title'),
      to: '/settings/modules/messaging-discord',
    },
    {
      category: 'messaging',
      configured: twitterStore.configured,
      description: t('settings.pages.modules.x.description'),
      icon: 'i-simple-icons:x',
      id: 'x',
      name: t('settings.pages.modules.x.title'),
      to: '/settings/modules/x',
    },
    {
      category: 'gaming',
      configured: minecraftStore.configured,
      description: t('settings.pages.modules.gaming-minecraft.description'),
      iconColor: 'i-vscode-icons:file-type-minecraft',
      id: 'gaming-minecraft',
      name: t('settings.pages.modules.gaming-minecraft.title'),
      to: '/settings/modules/gaming-minecraft',
    },
    {
      category: 'gaming',
      configured: factorioStore.configured,
      description: t('settings.pages.modules.gaming-factorio.description'),
      iconImage: factorioIcon,
      id: 'gaming-factorio',
      name: t('settings.pages.modules.gaming-factorio.title'),
      to: '/settings/modules/gaming-factorio',
    },
    {
      category: 'essential',
      configured: false,
      description: t('settings.pages.modules.mcp-server.description'),
      icon: 'i-solar:server-bold-duotone',
      id: 'mcp-server',
      name: t('settings.pages.modules.mcp-server.title'),
      to: '/settings/modules/mcp',
    },
    ...(beatSyncSupported
      ? [{
          category: 'essential',
          configured: beatSyncState.value?.isActive ?? false,
          description: t('settings.pages.modules.beat_sync.description'),
          icon: 'i-solar:music-notes-bold-duotone',
          id: 'beat-sync',
          name: t('settings.pages.modules.beat_sync.title'),
          to: '/settings/modules/beat-sync',
        }]
      : []),
  ])

  const categorizedModules = computed(() => {
    return modulesList.value.reduce((categories, module) => {
      const { category } = module
      if (!categories[category]) {
        categories[category] = []
      }
      categories[category].push(module)
      return categories
    }, {} as Record<string, Module[]>)
  })

  // Define category display names
  const categoryNames = computed(() => ({
    essential: t('settings.pages.modules.categories.essential'),
    gaming: t('settings.pages.modules.categories.gaming'),
    messaging: t('settings.pages.modules.categories.messaging'),
  }))

  // TODO(Makito): We can make this a reactive value from a synthetic store.
  onMounted(() => {
    if (!beatSyncSupported)
      return

    getBeatSyncState().then(initialState => beatSyncState.value = initialState)
    const removeListener = listenBeatSyncStateChange(newState => beatSyncState.value = { ...newState })
    onUnmounted(() => removeListener())
  })

  return {
    categorizedModules,
    categoryNames,
    modulesList,
  }
}
