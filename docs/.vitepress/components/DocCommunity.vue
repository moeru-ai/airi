<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useEditLink } from '../composables/edit-link'
import { discord, github, sponsor } from '../meta'

const editLink = useEditLink()
const { t } = useI18n()

const links = computed(() => [
  { label: editLink.value.text, url: editLink.value.url, icon: 'lucide:pencil-line' },
  { label: t('docs.theme.doc.community.star-github.title'), url: github, icon: 'lucide:star' },
  { label: t('docs.theme.doc.community.discord.title'), url: discord, icon: 'lucide:messages-square' },
  { label: t('docs.theme.doc.community.support.title'), url: sponsor, icon: 'lucide:hand-heart' },
])
</script>

<template>
  <div>
    <div class="pt-4">
      <div class="mb-2 text-sm font-bold">
        {{ t('docs.theme.doc.community.title') }}
      </div>

      <div class="mt-4 space-y-3 lg:space-y-2">
        <a
          v-for="link in links"
          :key="link.label"
          :href="link.url"
          target="_blank"
          class="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
          transition-colors duration-200 ease-in-out
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
