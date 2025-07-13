<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'

import { useEditLink } from '../composables/edit-link'
import { discord, github, sponsor } from '../meta'

const editLink = useEditLink()

const links = computed(() => [
  { label: editLink.value.text, url: editLink.value.url, icon: 'lucide:pencil-line' },
  { label: 'Star on GitHub', url: github, icon: 'lucide:star' },
  { label: 'Chat on Discord', url: discord, icon: 'lucide:messages-square' },
  { label: 'Support the project', url: sponsor, icon: 'lucide:hand-heart' },
])
</script>

<template>
  <div>
    <div class="pt-4">
      <div class="mb-2 text-sm font-bold">
        Community
      </div>

      <div class="mt-4 space-y-3 lg:space-y-2">
        <a
          v-for="link in links"
          :key="link.label"
          :href="link.url"
          target="_blank"
          class="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
        >
          <Icon
            class="text-xl"
            :icon="link.icon"
          />
          <span>{{ link.label }}</span>
          <Icon
            class="text-base"
            icon="lucide:arrow-up-right"
          />
        </a>
      </div>
    </div>
  </div>
</template>
