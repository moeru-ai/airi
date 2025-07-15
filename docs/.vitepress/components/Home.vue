<script setup lang="ts">
import homeCover from '../assets/home-cover-2025-07-15.png'
</script>

<template>
  <div relative h-full w-full flex flex-1 flex-col>
    <section h-full w-full flex flex-1 flex-col class="mx-auto max-w-[1440px]">
      <div class="items-center justify-start pt-20 md:pt-36" h-full w-full flex flex-1 flex-col gap-4 overflow-hidden px-16 pb-16>
        <div bg="transparent" font-extrabold font-sans-rounded class="relative z-3 w-full flex justify-center" text="4xl md:5xl">
          <div>
            Project AIRI
          </div>
        </div>
        <div max-w="120 md:150 lg:200" text-wrap class="relative z-3 text-center text-slate-900 dark:text-white">
          A container of souls of AI waifu / virtual characters to bring them into our worlds.
        </div>
        <div class="relative z-3 justify-center" w-full flex gap-2>
          <a
            href="https://github.com/moeru-ai/airi/releases/latest"
            bg="primary/10 dark:primary/10" class="text-primary"
            rounded-lg px-4 py-2 font-extrabold outline-none backdrop-blur-md focus:outline-none
          >
            Download
          </a>
          <a
            href="./docs/overview/"
            class="bg-white/60 text-slate-900 dark:bg-white/10 dark:text-slate-400"
            rounded-lg px-4 py-2 font-extrabold outline-none backdrop-blur-md focus:outline-none
          >
            Get Started
          </a>
        </div>
        <div class="z-1 max-h-[calc(100dvh-9.5rem)] max-w-100dvw min-h-[calc(100dvh-9.5rem)] min-w-100dvw" absolute overflow-hidden>
          <div class="absolute left-0 top-16 z-2 block h-1/2 w-full scale-120 from-transparent to-white bg-gradient-to-t md:top-0 dark:to-black" />
          <img :src="homeCover" alt="Project AIRI Cover Image" class="absolute translate-y-90 rotate--20 scale-160 object-cover object-cover lg:translate-y--10 md:translate-y-60 lg:scale-90 md:scale-120">
        </div>
      </div>
    </section>

    <footer class="fixed bottom-3 left-50% z-4 flex translate-x--1/2 justify-end">
      <div class="text-muted-foreground rounded-full px-3 py-2 text-sm backdrop-blur-md" bg="white/80 dark:white/20" text="slate-400 dark:slate-900 nowrap">
        Since 2024 @ <a href="https://github.com/proj-airi">Project AIRI</a> × <a href="https://github.com/moeru-ai">萌える AI 研究会</a>
      </div>
    </footer>
  </div>
</template>
