<script setup lang="ts">
import { UTCDate } from '@date-fns/utc'
import { AboutDialog } from '@proj-airi/stage-ui/components'
import { abbreviatedSha, branch, committerDate } from '~build/git'
import { formatISO9075 } from 'date-fns'
import { ref } from 'vue'

const show = ref(false)
const localDate = formatISO9075(new UTCDate(committerDate))
</script>

<template>
  <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="About" @click="show = !show">
    <div i-solar:info-circle-outline size-5 text="neutral-500 dark:neutral-400" />
  </button>
  <AboutDialog v-model="show">
    <div max-w="calc[100%-2rem]" mx-auto h-full flex flex-col pt-14>
      <div mb-14 text-center text-5xl font-sans-rounded>
        <span text="neutral-400 dark:neutral-100/65">Project</span> <span text="pink-400 dark:pink-300/90">AIRI</span>
        <div mt-2 text-base>
          Web ver.
        </div>
      </div>
      <div flex-1>
        <div text="neutral-500 dark:neutral-400">
          Application build information
        </div>
        <div grid="~ cols-[70px_1fr]" mt-4 gap-2 text-sm>
          <div text="neutral-500 dark:neutral-400">
            Branch
          </div>
          <div font-mono>
            {{ branch }}
          </div>
          <div text="neutral-500 dark:neutral-400">
            Commit
          </div>
          <div font-mono>
            {{ abbreviatedSha.substring(0, 7) }}
          </div>
          <div text="neutral-500 dark:neutral-400">
            Built on
          </div>
          <div font-mono>
            {{ localDate }}
          </div>
        </div>
      </div>
      <div my-10>
        <div text="neutral-500 dark:neutral-400">
          About
        </div>
        <div mt-4 flex flex-col gap-2>
          <a
            :class="[
              'block', 'flex items-center gap-2',
              'rounded-xl px-3 py-2 lg:px-5 lg:py-3 outline-none backdrop-blur-md active:scale-95 focus:outline-none text-nowrap text-sm md:text-base',
              'text-slate-700 dark:text-slate-100',
            ]"
            bg="black/4 dark:black/10 dark:hover:white/30"
            transition="colors,transform duration-200 ease-in-out"
            href="https://airi.moeru.ai/docs/"
            target="_blank"
          >
            <div i-solar:home-smile-outline /><div>Home</div>
          </a>
          <a
            href="https://airi.moeru.ai/docs/en/docs/overview/"
            :class="[
              'block', 'flex items-center gap-2',
              'rounded-xl px-3 py-2 lg:px-5 lg:py-3 outline-none backdrop-blur-md active:scale-95 focus:outline-none text-nowrap text-sm md:text-base',
              'text-slate-700 dark:text-slate-100',
            ]"
            bg="black/4 dark:black/10 dark:hover:white/30"
            transition="colors,transform duration-200 ease-in-out"
            target="_blank"
          >
            <div i-solar:document-add-outline /><div>Documentations</div>
          </a>
          <a
            href="https://github.com/moeru-ai/airi"
            :class="[
              'block', 'flex items-center gap-2',
              'rounded-xl px-3 py-2 lg:px-5 lg:py-3 outline-none backdrop-blur-md active:scale-95 focus:outline-none text-nowrap text-sm md:text-base',
              'text-slate-700 dark:text-slate-100',
            ]"
            bg="black/4 dark:black/10 dark:hover:white/30"
            transition="colors,transform duration-200 ease-in-out"
            target="_blank"
          >
            <div i-simple-icons:github /><div>GitHub</div>
          </a>
        </div>
      </div>
    </div>
  </AboutDialog>
</template>
