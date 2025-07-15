<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import homeCover from '../assets/home-cover-2025-07-15.png'

const { t } = useI18n()
</script>

<template>
  <!-- eslint-disable vue/prefer-separate-static-class -->
  <div relative h-full w-full flex flex-1 flex-col>
    <section class="mx-auto h-full max-w-[1440px] w-full flex flex-1 flex-col">
      <div class="z-10 h-full w-full flex flex-1 flex-col items-center justify-start gap-4 overflow-hidden px-16 pb-16 pt-20 md:pt-36">
        <div class="relative w-full justify-center text-center font-extrabold font-sans-rounded" text="4xl md:5xl">
          <div>
            Project AIRI
          </div>
        </div>
        <div class="relative max-w-prose text-center text-slate-900 dark:text-white">
          {{ t('docs.theme.home.subtitle') }}
        </div>
        <div class="relative z-10 w-full flex justify-center gap-4">
          <a
            href="https://github.com/moeru-ai/airi/releases/latest"
            :class="[
              'rounded-xl px-5 py-3 font-extrabold outline-none backdrop-blur-md active:scale-95 focus:outline-none',
              'text-slate-700 dark:text-cyan-200',
            ]"
            bg="primary/20 dark:primary/30 dark:hover:primary/40"
            transition="colors,transform duration-200 ease-in-out"
          >
            {{ t('docs.theme.home.try-live.title') }}
          </a>
          <a
            href="https://github.com/moeru-ai/airi/releases/latest"
            :class="[
              'rounded-xl px-5 py-3 font-extrabold outline-none backdrop-blur-md active:scale-95 focus:outline-none',
              'text-slate-700 dark:text-slate-100',
            ]"
            bg="black/4 dark:white/20 dark:hover:white/30"
            transition="colors,transform duration-200 ease-in-out"
          >
            {{ t('docs.theme.home.download.title') }}
          </a>
          <a
            href="./docs/overview/"
            :class="[
              'rounded-xl px-5 py-3 font-extrabold outline-none backdrop-blur-md active:scale-95 focus:outline-none',
              'text-slate-700 dark:text-slate-100',
            ]"
            bg="black/4 dark:white/20 dark:hover:white/30"
            transition="colors,transform duration-200 ease-in-out"
          >
            {{ t('docs.theme.home.get-started.title') }}
          </a>
        </div>
      </div>
    </section>

    <div class="absolute inset-0 overflow-hidden -z-10">
      <!-- Flickering red (even within the color space range) if to top in oklch (UnoCSS or tailwind css default), have to force to use srgb color space to prevent this -->
      <div class="absolute bottom-0 left-0 right-0 top-10 z-2 h-full from-transparent to-white bg-gradient-to-t dark:to-[hsl(207_15%_5%)]" style="--un-gradient-shape: to top in srgb;" />
      <img
        :src="homeCover"
        alt="Project AIRI Cover Image"
        :class="[
          'absolute left-1/2 -translate-x-1/2 max-w-none object-cover z-1',
          'w-[160%] translate-y-[25%] -rotate-20 top-8rem',
          'md:w-[120%] md:translate-y-[20%] md:rotate-[-15deg] md:top-8dvh',
          'lg:w-[95%] lg:translate-y-[5%] lg:rotate-[-10deg] lg:top-32dvh',
          'xl:top-18dvh',
          '2xl:top-16dvh',
        ]"
      >
    </div>

    <footer class="fixed bottom-3 left-1/2 z-40 flex justify-end -translate-x-1/2">
      <div class="rounded-full bg-white/80 px-3 py-2 text-sm text-slate-400 backdrop-blur-md dark:bg-white/20 dark:text-slate-900" text="nowrap">
        Since 2024 @ <a href="https://github.com/proj-airi">Project AIRI</a> × <a href="https://github.com/moeru-ai">萌える AI 研究会</a>
      </div>
    </footer>
  </div>
</template>
