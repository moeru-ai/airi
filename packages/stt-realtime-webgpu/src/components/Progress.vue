<script setup lang="ts">
withDefaults(defineProps<{
  text: string
  percentage: number
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
  <div className="w-full bg-gray-100 dark:bg-gray-700 text-left rounded-lg overflow-hidden mb-0.5">
    <div className="bg-blue-400 whitespace-nowrap px-1 text-sm" :style="{ width: `${percentage}%` }">
      {{ text }} ({{ percentage.toFixed(2) }}%{{ Number.isNaN(total) ? '' : ` of ${formatBytes(total)}` }})
    </div>
  </div>
</template>
