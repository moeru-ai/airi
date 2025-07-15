<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { DropdownMenuItem, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from 'reka-ui'
import { useData, useRoute } from 'vitepress'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

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
  <DropdownMenuSub>
    <DropdownMenuSubTrigger class="text-muted-foreground h-full w-full inline-flex items-center justify-between rounded p-2 text-sm font-semibold hover:bg-primary/10 hover:text-primary">
      <span>{{ t('docs.theme.navbar.language.title') }}</span>
      <Icon icon="lucide:chevron-down" class="ml-1 text-lg" />
    </DropdownMenuSubTrigger>

    <DropdownMenuPortal>
      <DropdownMenuSubContent class="border-muted bg-card will-change-[transform,opacity] data-[state=open]:data-[side=bottom]:animate-slideUpAndFade z-10 w-[180px] border rounded-xl p-2 shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2)] focus:shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2),0_0_0_2px_green7]">
        <DropdownMenuItem
          v-for="item in languages"
          :key="item.text"
          class="text-muted-foreground h-full w-full inline-flex items-center rounded p-2 text-sm font-semibold hover:bg-primary/10 hover:text-primary"
        >
          <a
            v-if="item.link"
            :href="item.link"
            target="_blank"
            class="w-full flex items-center justify-between"
          >
            <span>{{ item.text }}</span>
          </a>
          <div v-else>
            {{ item.text }}
          </div>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  </DropdownMenuSub>
</template>
