<script setup lang="ts">
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { createMemoryGateway } from '@proj-airi/stage-ui/services/memory/gateway'
import { readMemoryStatusSnapshot } from '@proj-airi/stage-ui/services/memory/status'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { onMounted, shallowRef } from 'vue'

const authStore = useAuthStore()
const chatSessionStore = useChatSessionStore()
const cardStore = useAiriCardStore()

const status = shallowRef<{
  runtimeMode: string
  runtimeLabel: string
  syncMode: string
  syncMessage: string
  lastUploadAt: number | null
  lastPullAt: number | null
  pendingTurnCount: number
  lastAppliedSummaryVersion: number | null
  lastError: string | null
} | null>(null)

function formatTime(value: number | null) {
  if (!value)
    return 'Never'

  return new Date(value).toLocaleString()
}

onMounted(async () => {
  const runtime = isStageTamagotchi() ? 'desktop' : 'web'
  const gateway = createMemoryGateway({ runtime })

  status.value = await readMemoryStatusSnapshot({
    gateway,
    runtime,
    scope: {
      characterId: cardStore.activeCardId || 'default',
      sessionId: chatSessionStore.activeSessionId || null,
      userId: authStore.userId || 'local',
    },
  })
})
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-4']">
    <section :class="['rounded-2xl border border-black/10 bg-white/70 p-4 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-black/20']">
      <div :class="['flex flex-col gap-2']">
        <div :class="['text-base font-semibold']">
          {{ status?.runtimeLabel ?? 'Local-First Memory' }}
        </div>
        <div :class="['text-sm opacity-80']">
          {{ status?.syncMessage ?? 'Loading memory status...' }}
        </div>
        <div :class="['font-mono text-xs opacity-70']">
          {{ status?.runtimeMode ?? 'unknown' }}
        </div>
      </div>
    </section>

    <section :class="['rounded-2xl border border-black/10 bg-white/70 p-4 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-black/20']">
      <div :class="['mb-3 text-base font-semibold']">
        Status
      </div>
      <dl :class="['grid grid-cols-1 gap-3 text-sm md:grid-cols-2']" aria-label="memory-status">
        <div>
          <dt :class="['opacity-70']">
            Mode
          </dt>
          <dd>{{ status?.syncMode ?? 'unknown' }}</dd>
        </div>
        <div>
          <dt :class="['opacity-70']">
            Pending turns
          </dt>
          <dd>{{ status?.pendingTurnCount ?? 0 }}</dd>
        </div>
        <div>
          <dt :class="['opacity-70']">
            Last upload
          </dt>
          <dd>{{ formatTime(status?.lastUploadAt ?? null) }}</dd>
        </div>
        <div>
          <dt :class="['opacity-70']">
            Last pull
          </dt>
          <dd>{{ formatTime(status?.lastPullAt ?? null) }}</dd>
        </div>
        <div>
          <dt :class="['opacity-70']">
            Applied summary version
          </dt>
          <dd>{{ status?.lastAppliedSummaryVersion ?? 'None' }}</dd>
        </div>
        <div>
          <dt :class="['opacity-70']">
            Recent error
          </dt>
          <dd>{{ status?.lastError ?? 'None' }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:leaf-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
