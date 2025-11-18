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
  <!-- eslint-disable vue/prefer-separate-static-class -->
  <DropdownMenuSub>
    <DropdownMenuSubTrigger
      class="text-muted-foreground h-full w-full inline-flex cursor-pointer items-center justify-between rounded-lg p-2 text-sm font-semibold hover:bg-primary/10 hover:text-primary"
      :class="[
        'transition-all duration-200 ease-in-out',
      ]"
    >
      <span>{{ t('docs.theme.navbar.language.title') }}</span>
      <Icon icon="lucide:chevron-down" class="ml-1 text-lg" />
    </DropdownMenuSubTrigger>

    <DropdownMenuPortal>
      <DropdownMenuSubContent
        class="will-change-[transform,opacity] z-10 w-[180px] border rounded-xl p-2 shadow-md backdrop-blur-md data-[state=open]:data-[side=bottom]:animate-slideUpAndFade"
        :class="[
          'bg-white/20 dark:border-white/5 dark:bg-black/70',
          'transition-all duration-200 ease-in-out',
        ]"
      >
        <DropdownMenuItem
          v-for="item in languages"
          :key="item.text"
          class="text-muted-foreground h-full w-full inline-flex items-center rounded-lg p-2 text-sm font-semibold hover:text-primary"
          :class="[
            'hover:bg-primary/10',
            'transition-all duration-200 ease-in-out',
          ]"
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
