<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div flex="~ row" items-center gap-2>
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500">Modules</span>
      </div>
      <div text-3xl font-semibold>
        Consciousness
      </div>
    </h1>
  </div>
  <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4>
    <div flex="~ col gap-4">
      <div>
        <h2 class="text-lg md:text-2xl">
          Provider
        </h2>
        <div text="neutral-400 dark:neutral-400">
          <span>Select the suitable LLM provider for consciousness</span>
        </div>
      </div>
      <div max-w-full>
        <!--
          fieldset has min-width set to --webkit-min-container, in order to use over flow scroll,
          we need to set the min-width to 0.
          See also: https://stackoverflow.com/a/33737340
        -->
        <fieldset flex="~ row gap-4" :style="{ 'scrollbar-width': 'none' }" min-w-0 of-x-scroll scroll-smooth>
          <label
            v-for="(_, index) in 10"
            :key="index"
            border="2px solid"
            :class="[
              index === 0 ? 'bg-primary-50/50 dark:bg-primary-900' : 'bg-white dark:bg-neutral-900',
              index === 0 ? 'border-primary-300 dark:border-primary-800' : 'border-neutral-200 dark:border-neutral-800',
            ]"
            flex="~ col" block min-w-50 w-fit cursor-pointer items-start rounded-lg p-3 text-left
          >
            <input type="radio" name="provider" value="provider-1">
            <div flex="~ col" min-h-16 w-full items-center justify-center>
              Provider {{ index + 1 }}
            </div>
          </label>
        </fieldset>
      </div>
    </div>
  </div>
  <div fixed bottom-0 right-0 z--1 text="neutral-100/80 dark:neutral-500/20">
    <div text="40" i-lucide:ghost translate-x-10 translate-y-10 />
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
