<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { dirname, sep } from 'pathe'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, Separator } from 'reka-ui'
import { useData, useRoute } from 'vitepress'
import { ref, toRefs, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import DropdownMenu from './DropdownMenu.vue'
import MotionToggle from './MotionToggle.vue'
import NavbarLanguage from './NavbarLanguage.vue'
import NavbarLanguageSubMenu from './NavbarLanguageSubMenu.vue'
import ThemeToggle from './ThemeToggle.vue'

const { path } = toRefs(useRoute())
const { theme, site } = useData()
const { t } = useI18n()

const isPopoverOpen = ref(false)

watch(path, () => {
  isPopoverOpen.value = false
})

function isNavLinkActive(link: string, path: string) {
  let normalizedLink = link.toLowerCase()
  normalizedLink = normalizedLink.split(sep).filter(Boolean).length > (site.value.base !== '' ? 3 : 2) ? `${dirname(normalizedLink)}/` : normalizedLink

  const normalizedPath = path.toLowerCase()
  return normalizedPath.includes(normalizedLink)
}
</script>

<template>
  <!-- eslint-disable vue/prefer-separate-static-class -->
  <nav class="items-center hidden lg:flex">
    <template
      v-for="nav in theme.nav"
      :key="nav.text"
    >
      <a
        v-if="nav.link"
        :href="nav.link"
        class="text-muted-foreground hover:text-foreground mx-3 h-full inline-flex items-center py-2 text-nowrap text-sm font-semibold"
        transition-colors duration-200 ease-in-out
        :class="{ '!text-primary': isNavLinkActive(nav.link, path) }"
      >
        {{ nav.text }}
      </a>
      <DropdownMenu
        v-else-if="nav.items"
        :label="nav.text"
        :items="nav.items"
      />
    </template>

    <Separator
      class="bg-muted ml-2 mr-2 h-4 w-px"
      decorative
      orientation="vertical"
    />

    <NavbarLanguage />

    <div flex="~ row items-center justify-between gap-3">
      <MotionToggle />
      <ThemeToggle />
    </div>

    <Separator
      class="bg-muted mx-4 h-4 w-px"
      decorative
      orientation="vertical"
    />

    <a
      v-for="link in theme.socialLinks"
      :key="link.link"
      :href="link.link"
      :aria-label="link.icon"
      target="_blank"
      class="text-muted-foreground hover:text-foreground hover:bg-muted h-9 w-9 flex flex-shrink-0 items-center justify-center rounded-lg bg-transparent text-xl"
      transition="colors duration-200 ease-in-out"
    >
      <Icon :icon="`simple-icons:${link.icon}`" />
    </a>
  </nav>

  <div class="lg:hidden">
    <DropdownMenuRoot v-model:open="isPopoverOpen">
      <DropdownMenuTrigger class="rounded-lg p-2">
        <Icon icon="lucide:ellipsis" class="text-lg" />
      </DropdownMenuTrigger>

      <DropdownMenuPortal>
        <DropdownMenuContent
          side="bottom"
          :side-offset="5"
          align="end"
          class="will-change-[transform,opacity] z-10 w-[180px] border rounded-xl p-2 shadow-md backdrop-blur-md data-[state=open]:data-[side=bottom]:animate-slideUpAndFade"
          :class="[
            'bg-white/70 dark:border-white/5 dark:bg-black/70',
          ]"
          transition="colors duration-200 ease-in-out"
        >
          <nav class="flex flex-col">
            <template
              v-for="nav in theme.nav"
              :key="nav.text"
            >
              <DropdownMenuItem
                v-if="nav.link"
                as="a"
                :href="nav.link"
                class="text-muted-foreground h-full inline-flex items-center rounded-lg p-2 text-sm font-semibold hover:bg-primary/10 hover:text-primary"
                transition="colors duration-200 ease-in-out"
              >
                {{ nav.text }}
              </DropdownMenuItem>

              <DropdownMenuSub v-else-if="nav.items">
                <DropdownMenuSubTrigger
                  class="text-muted-foreground h-full w-full inline-flex cursor-pointer items-center justify-between rounded-lg p-2 text-sm font-semibold hover:bg-primary/10 hover:text-primary"
                  :class="[
                    'transition-all duration-200 ease-in-out',
                  ]"
                >
                  <span>{{ nav.text }}</span>
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
                      v-for="item in nav.items"
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
                        <Icon icon="lucide:arrow-up-right" class="ml-2 text-base" />
                      </a>
                      <div v-else>
                        {{ item.text }}
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </template>

            <Separator
              class="bg-muted my-2 h-px w-full"
              decorative
              orientation="horizontal"
            />

            <div class="flex items-center justify-between px-2 text-sm">
              <label
                for="theme-toggle"
                class="text-muted-foreground font-semibold"
              >{{ t('docs.theme.navbar.appearance.title') }}</label>
              <DropdownMenuItem
                as-child
                @select.prevent
              >
                <ThemeToggle />
              </DropdownMenuItem>
            </div>

            <div class="mt-2 flex items-center justify-between text-sm">
              <DropdownMenuItem
                as-child
                @select.prevent
              >
                <NavbarLanguageSubMenu hide-icon />
              </DropdownMenuItem>
            </div>

            <Separator
              class="bg-muted my-2 h-px w-full"
              decorative
              orientation="horizontal"
            />

            <div class="flex items-center gap-2 px-2">
              <DropdownMenuItem
                v-for="link in theme.socialLinks"
                :key="link.link"
                as="a"
                :href="link.link"
                :aria-label="link.icon"
                target="_blank"
                class="text-muted-foreground hover:text-foreground hover:bg-muted h-9 w-9 flex items-center justify-center rounded-lg bg-transparent text-xl"
                transition="colors duration-200 ease-in-out"
              >
                <Icon :icon="`simple-icons:${link.icon}`" />
              </DropdownMenuItem>
            </div>
          </nav>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
</template>
