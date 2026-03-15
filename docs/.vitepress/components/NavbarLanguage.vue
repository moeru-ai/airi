<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useData, useRoute } from 'vitepress'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import DropdownMenu from './DropdownMenu.vue'

const props = defineProps<{
  hideIcon?: boolean
}>()

const { site, lang } = useData()
const route = useRoute()
const { t } = useI18n()

const languages = computed(() => {
  const replacedLink = (targetLang: string) => {
    return route.path.replace(`/${lang.value}/`, `/${targetLang}/`)
  }

  return Object.values(site.value.locales).map(locale => ({
    text: locale.label,
    link: replacedLink(locale.lang!),
  }))
})
</script>

<template>
  <DropdownMenu
    :label="t('docs.theme.navbar.language.title')"
    :items="languages"
  >
    <template #trigger>
      <Icon
        v-if="!props.hideIcon"
        icon="lucide:globe"
        class="text-lg"
      />
      <Icon
        icon="lucide:chevron-down"
        class="ml-1 text-lg"
      />
    </template>
  </DropdownMenu>
</template>
