<script setup lang="ts">
import homeCover from '../assets/home-cover-2025-07-15.png'
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
          A container of souls of AI waifu / virtual characters to bring them into our worlds.
        </div>
        <div class="relative z-10 w-full flex justify-center gap-4">
          <a
            href="https://github.com/moeru-ai/airi/releases/latest"
            class="rounded-lg bg-primary/60 px-4 py-2 text-slate-100 font-extrabold outline-none backdrop-blur-md dark:bg-primary/30 dark:text-cyan-200 focus:outline-none"
          >
            Download
          </a>
          <a
            href="./docs/overview/"
            class="rounded-lg bg-white/60 px-4 py-2 text-slate-900 font-extrabold outline-none backdrop-blur-md dark:bg-white/20 dark:text-slate-100 focus:outline-none"
          >
            Get Started
          </a>
        </div>
      </div>
    </section>

    <div class="absolute inset-0 overflow-hidden -z-10">
      <div class="absolute bottom-0 left-0 right-0 z-2 h-full from-transparent to-white bg-gradient-to-t dark:to-[hsl(207_15%_5%)]" />
      <img
        :src="homeCover"
        alt="Project AIRI Cover Image"
        :class="[
          'absolute top-2rem md:top-8dvh lg:top-32dvh xl:top-20dvh left-1/2 -translate-x-1/2 max-w-none object-cover z-1',
          'w-[160%] translate-y-[25%] -rotate-20',
          'md:w-[120%] md:translate-y-[20%] md:rotate-[-15deg]',
          'lg:w-[95%] lg:translate-y-[5%] lg:rotate-[-10deg]',
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
