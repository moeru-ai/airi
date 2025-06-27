<script setup lang="ts">
import { useData } from 'vitepress'
import { computed, onMounted, ref, watchEffect } from 'vue'

const { theme, page, lang } = useData()

const date = computed(
  () => new Date(page.value.lastUpdated!),
)
const isoDatetime = computed(() => date.value.toISOString())
const datetime = ref('')

// set time on mounted hook to avoid hydration mismatch due to
// potential differences in timezones of the server and clients
onMounted(() => {
  watchEffect(() => {
    datetime.value = new Intl.DateTimeFormat(
      theme.value.lastUpdated?.formatOptions?.forceLocale ? lang.value : undefined,
      theme.value.lastUpdated?.formatOptions ?? {
        dateStyle: 'short',
        timeStyle: 'short',
      },
    ).format(date.value)
  })
})
</script>

<template>
  <p>
    {{ theme.lastUpdated?.text || theme.lastUpdatedText || 'Last updated' }}:
    <time :datetime="isoDatetime">{{ datetime }}</time>
  </p>
</template>
