<script setup lang="ts">
import { LocalNotifications } from '@capacitor/local-notifications'
import { OnboardingDialog, ToasterRoot } from '@proj-airi/stage-ui/components'
import { registerOnboardingStep } from '@proj-airi/stage-ui/components/scenarios/dialogs/onboarding/utils'
import { useSharedAnalyticsStore } from '@proj-airi/stage-ui/stores/analytics'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character-orchestrator'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { StageTransitionGroup } from '@proj-airi/ui-transitions'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import StepNotificationPermission from './components/onboarding/step-notification-permission.vue'

const contextBridgeStore = useContextBridgeStore()
const i18n = useI18n()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const settings = storeToRefs(settingsStore)
const onboardingStore = useOnboardingStore()
const serverChannelStore = useModsServerChannelStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const { shouldShowSetup } = storeToRefs(onboardingStore)
const { isDark } = useTheme()
const cardStore = useAiriCardStore()
const analyticsStore = useSharedAnalyticsStore()

let messageCompleteDisposer: (() => void) | undefined

const primaryColor = computed(() => {
  return isDark.value
    ? `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${0})) 70%, oklch(50% 0 360))`
    : `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${0})) 90%, oklch(90% 0 360))`
})

const secondaryColor = computed(() => {
  return isDark.value
    ? `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${180})) 70%, oklch(50% 0 360))`
    : `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${180})) 90%, oklch(90% 0 360))`
})

const tertiaryColor = computed(() => {
  return isDark.value
    ? `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${60})) 70%, oklch(50% 0 360))`
    : `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${60})) 90%, oklch(90% 0 360))`
})

const colors = computed(() => {
  return [primaryColor.value, secondaryColor.value, tertiaryColor.value, isDark.value ? '#121212' : '#FFFFFF']
})

watch(settings.language, () => {
  i18n.locale.value = settings.language.value
})

watch(settings.themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', settings.themeColorsHue.value.toString())
}, { immediate: true })

watch(settings.themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', settings.themeColorsHueDynamic.value)
}, { immediate: true })

// Send system notification for message completion
async function sendSystemNotification(title: string, body: string) {
  try {
    const permission = await LocalNotifications.checkPermissions()
    if (permission.display === 'denied') {
      return
    }
    if (permission.display !== 'granted') {
      const result = await LocalNotifications.requestPermissions()
      if (result.display !== 'granted') {
        return
      }
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now(),
          title,
          body,
        },
      ],
    })
  }
  catch (error) {
    console.error('Failed to send system notification:', error)
  }
}

// Register pocket-specific onboarding steps
registerOnboardingStep({
  stepNumber: 5,
  component: StepNotificationPermission,
})

// Initialize first-time setup check when app mounts
onMounted(async () => {
  analyticsStore.initialize()
  cardStore.initialize()

  onboardingStore.initializeSetupCheck()

  await serverChannelStore.initialize({ possibleEvents: ['ui:configure', 'output:gen-ai:chat:complete'] }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
  await contextBridgeStore.initialize()
  characterOrchestratorStore.initialize()

  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()

  // Listen for message completion events from tamagotchi
  messageCompleteDisposer = serverChannelStore.onEvent('output:gen-ai:chat:complete', (event) => {
    // Only show notification if message is from tamagotchi
    if (event.data['stage-tamagotchi']) {
      const message = event.data.message
      let messageText = ''

      // Extract text content from message
      if (typeof message.content === 'string') {
        messageText = message.content
      }
      else if (Array.isArray(message.content)) {
        // Extract text from content parts
        messageText = message.content
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text || '')
          .join('')
      }

      // Truncate long messages for notification
      const truncatedText = messageText.length > 100 ? `${messageText.slice(0, 100)}...` : messageText

      if (truncatedText.trim()) {
        const notificationTitle = i18n.t('stage.chat.notification.new-message')

        // Show toast notification
        toast.info(notificationTitle, {
          description: truncatedText,
          duration: 5000,
        })

        // Send system notification
        sendSystemNotification(notificationTitle, truncatedText)
      }
    }
  })
})

onUnmounted(() => {
  contextBridgeStore.dispose()
  if (messageCompleteDisposer) {
    messageCompleteDisposer()
  }
})

// Handle first-time setup events
function handleSetupConfigured() {
  onboardingStore.markSetupCompleted()
}

function handleSetupSkipped() {
  onboardingStore.markSetupSkipped()
}
</script>

<template>
  <StageTransitionGroup
    :primary-color="primaryColor"
    :secondary-color="secondaryColor"
    :tertiary-color="tertiaryColor"
    :colors="colors"
    :z-index="100"
    :disable-transitions="settings.disableTransitions.value"
    :use-page-specific-transitions="settings.usePageSpecificTransitions.value"
  >
    <RouterView v-slot="{ Component }">
      <KeepAlive :include="['IndexScenePage', 'StageScenePage']">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </StageTransitionGroup>

  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>

  <!-- First Time Setup Dialog -->
  <OnboardingDialog
    v-model="shouldShowSetup"
    @configured="handleSetupConfigured"
    @skipped="handleSetupSkipped"
  />
</template>

<style>
/* We need this to properly animate the CSS variable */
@property --chromatic-hue {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

@keyframes hue-anim {
  from {
    --chromatic-hue: 0;
  }
  to {
    --chromatic-hue: 360;
  }
}

.dynamic-hue {
  animation: hue-anim 10s linear infinite;
}
</style>
