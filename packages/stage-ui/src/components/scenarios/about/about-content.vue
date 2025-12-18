<script setup lang="ts">
import type { AboutBuildInfo, AboutLink } from './types'

import { computed } from 'vue'

const props = withDefaults(defineProps<{
  title?: string
  highlight?: string
  subtitle?: string
  buildInfo?: AboutBuildInfo
  links?: AboutLink[]
}>(), {
  title: 'Project',
  highlight: 'AIRI',
  subtitle: '',
  links: () => ([
    { label: 'Home', href: 'https://airi.moeru.ai/docs/', icon: 'i-solar:home-smile-outline' },
    { label: 'Documentations', href: 'https://airi.moeru.ai/docs/en/docs/overview/', icon: 'i-solar:document-add-outline' },
    { label: 'GitHub', href: 'https://github.com/moeru-ai/airi', icon: 'i-simple-icons:github' },
  ]),
})

const hasBuildInfo = computed(() => {
  const info = props.buildInfo
  if (!info)
    return false

  return Boolean(info.branch || info.commit || info.builtOn || info.version)
})
</script>

<template>
  <div :class="['max-w-[min(960px,calc(100%-2rem))]', 'mx-auto', 'h-full', 'flex', 'flex-col', 'pt-14']">
    <div :class="['mb-14', 'text-center', 'text-5xl', 'font-sans-rounded']">
      <span :class="['text-neutral-400 dark:text-neutral-100/65']">{{ title }}</span>
      <span :class="['text-pink-400 dark:text-pink-300/90']"> {{ highlight }}</span>
      <div v-if="subtitle" :class="['mt-2 text-base']">
        {{ subtitle }}
      </div>
    </div>

    <div v-if="hasBuildInfo" :class="['flex-1']">
      <div :class="['text-neutral-500 dark:text-neutral-400']">
        Application build information
      </div>
      <div :class="['mt-4', 'grid grid-cols-[120px_1fr]', 'gap-2', 'text-sm']">
        <template v-if="buildInfo?.version">
          <div :class="['text-neutral-500 dark:text-neutral-400']">
            Version
          </div>
          <div :class="['font-mono']">
            {{ buildInfo.version }}
          </div>
        </template>
        <template v-if="buildInfo?.branch">
          <div :class="['text-neutral-500 dark:text-neutral-400']">
            Branch
          </div>
          <div :class="['font-mono']">
            {{ buildInfo.branch }}
          </div>
        </template>
        <template v-if="buildInfo?.commit">
          <div :class="['text-neutral-500 dark:text-neutral-400']">
            Commit
          </div>
          <div :class="['font-mono']">
            {{ buildInfo.commit }}
          </div>
        </template>
        <template v-if="buildInfo?.builtOn">
          <div :class="['text-neutral-500 dark:text-neutral-400']">
            Built on
          </div>
          <div :class="['font-mono']">
            {{ buildInfo.builtOn }}
          </div>
        </template>
      </div>
    </div>

    <div :class="['my-10']">
      <div :class="['text-neutral-500 dark:text-neutral-400']">
        About
      </div>
      <div :class="['mt-4 flex flex-col gap-2']">
        <a
          v-for="link in links"
          :key="link.href"
          :class="[
            'block',
            'flex items-center gap-2',
            'rounded-xl',
            'px-3 py-2',
            'lg:px-5 lg:py-3',
            'outline-none',
            'backdrop-blur-md',
            'active:scale-98',
            'focus:outline-none',
            'text-nowrap',
            'text-sm md:text-base',
            'text-slate-700 dark:text-slate-100',
            'bg-black/4',
            'transition-colors transition-transform duration-200 ease-in-out',
            'hover:bg-black/6',
            'dark:bg-black/10 dark:hover:bg-white/20',
          ]"
          :href="link.href"
          target="_blank"
        >
          <div :class="link.icon" />
          <div>{{ link.label }}</div>
        </a>
      </div>
    </div>
  </div>
</template>
