import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBeatSyncStore } from '../stores/beat-sync'
import { useMemoryStore } from '../stores/memory'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useDiscordStore } from '../stores/modules/discord'
import { useFactorioStore } from '../stores/modules/gaming-factorio'
import { useMinecraftStore } from '../stores/modules/gaming-minecraft'
import { useHearingStore } from '../stores/modules/hearing'
import { useMessagingStore } from '../stores/modules/messaging'
import { useSpeechStore } from '../stores/modules/speech'
import { useTelegramStore } from '../stores/modules/telegram'
import { useTwitterStore } from '../stores/modules/twitter'
import { useVisionStore } from '../stores/modules/vision'

export interface Module {
  id: string
  name: string
  description: string
  icon?: string
  iconColor?: string
  iconImage?: string
  to: string
  configured: boolean
  category: string
}

export function useModulesList() {
  const { t } = useI18n()

  // Initialize stores
  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const hearingStore = useHearingStore()
  const messagingStore = useMessagingStore()
  const discordStore = useDiscordStore()
  const telegramStore = useTelegramStore()
  const visionStore = useVisionStore()
  const twitterStore = useTwitterStore()
  const minecraftStore = useMinecraftStore()
  const factorioStore = useFactorioStore()
  const beatSyncStore = useBeatSyncStore()
  const memoryStore = useMemoryStore()
  const { shortTermConfigured, longTermConfigured } = storeToRefs(memoryStore)

  const modulesList = computed<Module[]>(() => {
    const messagingIcon = (() => {
      if (discordStore.configured) {
        return 'i-simple-icons:discord'
      }
      if (telegramStore.configured) {
        return 'i-simple-icons:telegram'
      }
      return 'i-solar:chat-circle-bold-duotone'
    })()

    return [
      {
        id: 'consciousness',
        name: t('settings.pages.modules.consciousness.title'),
        description: t('settings.pages.modules.consciousness.description'),
        icon: 'i-solar:ghost-bold-duotone',
        to: '/settings/modules/consciousness',
        configured: consciousnessStore.configured,
        category: 'essential',
      },
      {
        id: 'speech',
        name: t('settings.pages.modules.speech.title'),
        description: t('settings.pages.modules.speech.description'),
        icon: 'i-solar:user-speak-rounded-bold-duotone',
        to: '/settings/modules/speech',
        configured: speechStore.configured,
        category: 'essential',
      },
      {
        id: 'hearing',
        name: t('settings.pages.modules.hearing.title'),
        description: t('settings.pages.modules.hearing.description'),
        icon: 'i-solar:microphone-3-bold-duotone',
        to: '/settings/modules/hearing',
        configured: hearingStore.configured,
        category: 'essential',
      },
      {
        id: 'vision',
        name: t('settings.pages.modules.vision.title'),
        description: t('settings.pages.modules.vision.description'),
        icon: 'i-solar:eye-bold-duotone',
        to: '/settings/modules/vision',
        configured: visionStore.configured,
        category: 'essential',
      },
      {
        id: 'memory-short-term',
        name: t('settings.pages.modules.memory-short-term.title'),
        description: t('settings.pages.modules.memory-short-term.description'),
        icon: 'i-solar:bookmark-bold-duotone',
        to: '/settings/modules/memory-short-term',
        configured: shortTermConfigured.value,
        category: 'essential',
      },
      {
        id: 'memory-long-term',
        name: t('settings.pages.modules.memory-long-term.title'),
        description: t('settings.pages.modules.memory-long-term.description'),
        icon: 'i-solar:book-bookmark-bold-duotone',
        to: '/settings/modules/memory-long-term',
        configured: longTermConfigured.value,
        category: 'essential',
      },
      {
        id: 'messaging',
        name: t('settings.pages.modules.messaging.title'),
        description: t('settings.pages.modules.messaging.description'),
        icon: messagingIcon,
        to: '/settings/modules/messaging',
        configured: messagingStore.configured,
        category: 'messaging',
      },
      {
        id: 'x',
        name: t('settings.pages.modules.x.title'),
        description: t('settings.pages.modules.x.description'),
        icon: 'i-simple-icons:x',
        to: '/settings/modules/x',
        configured: twitterStore.configured,
        category: 'messaging',
      },
      {
        id: 'gaming-minecraft',
        name: t('settings.pages.modules.gaming-minecraft.title'),
        description: t('settings.pages.modules.gaming-minecraft.description'),
        icon: 'i-vscode-icons:file-type-minecraft',
        to: '/settings/modules/gaming-minecraft',
        configured: minecraftStore.configured,
        category: 'gaming',
      },
      {
        id: 'gaming-factorio',
        name: t('settings.pages.modules.gaming-factorio.title'),
        description: t('settings.pages.modules.gaming-factorio.description'),
        icon: 'i-lobe-icons:factorio',
        to: '/settings/modules/gaming-factorio',
        configured: factorioStore.configured,
        category: 'gaming',
      },
      {
        id: 'mcp-server',
        name: t('settings.pages.modules.mcp-server.title'),
        description: t('settings.pages.modules.mcp-server.description'),
        icon: 'i-solar:server-bold-duotone',
        to: '/settings/modules/mcp',
        configured: false,
        category: 'essential',
      },
      {
        id: 'beat-sync',
        name: t('settings.pages.modules.beat_sync.title'),
        description: t('settings.pages.modules.beat_sync.description'),
        icon: 'i-solar:music-notes-bold-duotone',
        to: '/settings/modules/beat-sync',
        configured: beatSyncStore.isActive,
        category: 'essential',
      },
    ]
  })

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
    messaging: t('settings.pages.modules.categories.messaging'),
    gaming: t('settings.pages.modules.categories.gaming'),
  }))

  return {
    modulesList,
    categorizedModules,
    categoryNames,
  }
}
