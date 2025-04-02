<script setup lang="ts">
interface Props {
  id: string
  name: string
  description?: string
  isActive: boolean
  isSelected: boolean
  version: string
  consciousnessModel: string
  voiceModel: string
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'select'): void
  (e: 'activate'): void
  (e: 'delete'): void
}>()
</script>

<template>
  <div
    class="relative h-full min-h-[120px] flex flex-col cursor-pointer overflow-hidden rounded-xl transition-all duration-300"
    :class="[
      isSelected
        ? 'border-2 border-primary-400 dark:border-primary-600'
        : 'border border-neutral-200/70 dark:border-neutral-700/50',
    ]"
    :style="{ transform: isSelected ? 'scale(1)' : 'scale(0.98)', opacity: isSelected ? 1 : 0.95 }"
    hover="scale-100 opacity-100 shadow-md dark:shadow-xl"
    @click="emit('select')"
  >
    <!-- Card content -->
    <div class="flex flex-1 flex-col justify-between gap-3 bg-white p-5 dark:bg-neutral-900/90">
      <!-- Card header (name and badge) -->
      <div class="flex items-start justify-between gap-2">
        <h3 class="flex-1 truncate text-lg font-bold">
          {{ name }}
        </h3>
        <div v-if="isActive" class="bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400 shrink-0 rounded-md p-1">
          <div i-solar:check-circle-bold-duotone text-sm />
        </div>
      </div>

      <!-- Card description -->
      <p v-if="description" class="line-clamp-3 min-h-[40px] flex-1 text-sm text-neutral-600 dark:text-neutral-400">
        {{ description }}
      </p>

      <!-- Card stats -->
      <div class="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <div>v{{ version }}</div>
        <div class="flex items-center gap-1.5">
          <div class="flex items-center gap-0.5">
            <div i-lucide:ghost class="text-xs" />
            <span>{{ consciousnessModel }}</span>
          </div>
          <div class="flex items-center gap-0.5">
            <div i-lucide:mic class="text-xs" />
            <span>{{ voiceModel }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Card actions -->
    <div class="flex justify-end gap-1 bg-neutral-50 px-2 py-1.5 dark:bg-neutral-800/50">
      <button
        class="rounded-lg p-1.5 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700/50"
        :disabled="isActive"
        @click.stop="emit('activate')"
      >
        <div
          :class="[
            isActive
              ? 'i-solar:check-circle-bold-duotone text-primary-500 dark:text-primary-400'
              : 'i-solar:play-circle-broken text-neutral-500 dark:text-neutral-400',
          ]"
        />
      </button>
      <button
        v-if="id !== 'default'"
        class="rounded-lg p-1.5 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700/50"
        @click.stop="emit('delete')"
      >
        <div i-solar:trash-bin-trash-linear text-neutral-500 dark:text-neutral-400 />
      </button>
    </div>
  </div>
</template>
