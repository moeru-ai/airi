<script lang="ts" setup>
defineProps<{
  syncing: boolean
  connected: boolean
}>()

const emit = defineEmits<{
  (event: 'refresh'): void
}>()
</script>

<template>
  <header :class="['flex', 'items-center', 'justify-between', 'gap-3']">
    <div :class="['flex', 'flex-col', 'gap-1']">
      <h1 :class="['text-lg', 'font-600', 'tracking-tight']">
        AIRI Web Extension
      </h1>
      <p :class="['text-xs', 'opacity-70']">
        Context provider for AIRI Stage
      </p>
    </div>
    <div :class="['flex', 'items-center', 'gap-2']">
      <button
        :disabled="syncing"
        :class="['transition', syncing ? 'opacity-60 cursor-not-allowed' : '']"
        @click="emit('refresh')"
      >
        <div :class="[syncing ? 'i-svg-spinners:ring-resize' : 'i-solar:refresh-linear', 'size-4']" />
      </button>
      <span :class="['px-2', 'py-1', 'rounded-full', 'text-xs', 'font-600', connected ? 'bg-emerald-400/20' : 'bg-rose-400/20', connected ? 'text-emerald-100' : 'text-rose-100']">
        {{ connected ? 'Connected' : 'Offline' }}
      </span>
    </div>
  </header>
</template>
