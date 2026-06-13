<script setup lang="ts">
import type { VoicePack } from '../modules/api'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared'
import { Button } from '@proj-airi/ui'
import { computed, onMounted, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { adminApi } from '../modules/api'

const router = useRouter()

const packs = shallowRef<VoicePack[]>([])
const loading = shallowRef(false)

const enabledCount = computed(() => packs.value.filter(pack => pack.enabled).length)
const disabledCount = computed(() => packs.value.length - enabledCount.value)

onMounted(() => {
  void loadPacks()
})

async function loadPacks() {
  loading.value = true
  try {
    packs.value = await adminApi.voicePacks()
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to load Voice Packs'))
  }
  finally {
    loading.value = false
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

function formatMultiplier(value: number): string {
  return `${Number(value.toFixed(2))}x`
}

function editPack(pack: VoicePack) {
  void router.push(`/voice-packs/${encodeURIComponent(pack.id)}/edit`)
}
</script>

<template>
  <section :class="['panel', 'overflow-hidden']">
    <div :class="['flex', 'flex-col', 'gap-3', 'border-b', 'border-neutral-200', 'px-5', 'py-4', 'md:flex-row', 'md:items-center', 'md:justify-between']">
      <div>
        <h2 :class="['text-sm', 'font-semibold']">
          Voice Packs
        </h2>
        <p :class="['mt-1', 'text-sm', 'text-neutral-500']">
          Curated speech presets exposed to users for character-card binding.
        </p>
      </div>
      <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
        <span :class="['badge', 'badge-green']">
          <span :class="['i-lucide-volume-2']" />
          {{ enabledCount }} enabled
        </span>
        <span :class="['badge', disabledCount > 0 ? 'badge-amber' : 'badge-green']">
          <span :class="['i-lucide-circle-slash']" />
          {{ disabledCount }} disabled
        </span>
        <RouterLink to="/voice-packs/new">
          <Button icon="i-lucide-plus" label="New" size="sm" variant="secondary" />
        </RouterLink>
      </div>
    </div>

    <div v-if="loading && packs.length === 0" :class="['empty-state']">
      <span :class="['i-lucide-loader-2', 'animate-spin', 'text-2xl']" />
      Loading Voice Packs
    </div>

    <table v-else-if="packs.length > 0" :class="['table']">
      <thead>
        <tr>
          <th>Name</th>
          <th>Routing</th>
          <th>Voice</th>
          <th>Cost</th>
          <th>Status</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="pack in packs"
          :key="pack.id"
          :class="['cursor-pointer', 'transition-colors', 'hover:bg-neutral-50']"
          tabindex="0"
          @click="editPack(pack)"
          @keydown.enter.prevent="editPack(pack)"
          @keydown.space.prevent="editPack(pack)"
        >
          <td>
            <div :class="['font-medium']">
              {{ pack.name }}
            </div>
            <div :class="['mt-1', 'max-w-[280px]', 'truncate', 'text-xs', 'text-neutral-500']">
              {{ pack.description || 'No description' }}
            </div>
          </td>
          <td>
            <div :class="['text-xs', 'font-mono']">
              {{ pack.ttsModelId }}
            </div>
            <div :class="['mt-1', 'text-xs', 'text-neutral-500']">
              {{ pack.provider }} / {{ pack.model }}
            </div>
          </td>
          <td :class="['text-xs', 'font-mono']">
            {{ pack.voiceId }}
          </td>
          <td>{{ formatMultiplier(pack.costMultiplier) }}</td>
          <td>
            <span :class="['badge', pack.enabled ? 'badge-green' : 'badge-amber']">
              <span :class="[pack.enabled ? 'i-lucide-check-circle-2' : 'i-lucide-pause-circle']" />
              {{ pack.enabled ? 'Enabled' : 'Disabled' }}
            </span>
          </td>
          <td>{{ formatDate(pack.updatedAt) }}</td>
        </tr>
      </tbody>
    </table>

    <div v-else :class="['empty-state']">
      <span :class="['i-lucide-volume-x', 'text-2xl']" />
      No Voice Packs configured
      <RouterLink to="/voice-packs/new">
        <Button icon="i-lucide-plus" label="Create Voice Pack" size="sm" variant="secondary" />
      </RouterLink>
    </div>
  </section>
</template>
