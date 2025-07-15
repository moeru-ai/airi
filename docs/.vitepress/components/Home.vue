<script setup lang="ts">
</script>

<template>
  <section h-full w-full flex flex-1 flex-col>
    <div h-full w-full flex flex-1 flex-col items-start justify-center gap-4 p-16>
      <div bg="transparent" font-extrabold font-sans-rounded class="w-full text-center sm:w-fit sm:text-left" text="4xl md:5xl">
        Project AIRI
      </div>
      <div max-w-200 text-wrap class="text-center sm:text-left">
        A container of souls of AI waifu / virtual characters to bring them into our worlds.
      </div>
      <div class="justify-center sm:justify-start" w-full flex gap-2>
        <a
          href="https://github.com/moeru-ai/airi/releases/latest"
          bg="primary/10 dark:primary/10" class="text-primary"
          rounded-lg px-4 py-2 font-extrabold outline-none backdrop-blur-md focus:outline-none
        >
          Download
        </a>
        <a
          href="./docs/overview/"
          class="text-slate"
          rounded-lg px-4 py-2 font-extrabold outline-none backdrop-blur-md focus:outline-none
        >
          Get Started
        </a>
      </div>
    </div>
  </section>

  <footer class="mx-auto max-w-screen-xl flex justify-end px-4 py-8 md:px-6">
    <div class="text-muted-foreground text-sm">
      Since 2024 @ <a href="https://github.com/proj-airi">Project AIRI</a> × <a href="https://github.com/moeru-ai">萌える AI 研究会</a>
    </div>
  </footer>
</template>
