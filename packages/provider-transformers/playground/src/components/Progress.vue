<script setup lang="ts">
withDefaults(defineProps<{
  text: string
  percentage?: number
  total?: number
}>(), {
  percentage: 0,
})

function formatBytes(size?: number) {
  if (!size)
    size = 0

  const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024))
  return +((size / 1024 ** i).toFixed(2)) * 1 + ['B', 'kB', 'MB', 'GB', 'TB'][i]
}
</script>

<template>
  <div
    class="flex items-center justify-between whitespace-nowrap rounded-lg bg-violet-100 px-3 py-2 text-sm dark:bg-violet-900"
    :style="{ width: `${percentage}%` }"
  >
    <span>{{ text }}</span>
    <span>({{ percentage.toFixed(2) }}%{{ Number.isNaN(total) ? '' : ` of ${formatBytes(total)}` }})</span>
  </div>
</template>
