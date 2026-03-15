<script setup lang="ts">
import ClearDay from '../assets/clear-day.svg'
import Skeleton from './Skeleton.vue'

const props = defineProps<{
  propsLoading: boolean

  city?: string
  temperature?: string
  condition?: string
}>()
</script>

<template>
  <div>
    <Skeleton v-if="props.propsLoading" rounded-2xl py-2 pl-3 pr-1 class="grid grid-cols-4 grid-rows-3 max-h-35 gap-2">
      <Skeleton animation="wave" class="grid-col-span-3 h-[1lh] w-20% rounded-2xl" />
      <div class="col-span-1 row-span-2 h-20 w-20 justify-self-end" />
      <Skeleton animation="wave" class="col-span-2 row-span-2 h-full w-20% inline-flex items-end rounded-2xl text-gray-600 font-thin dark:text-gray-300" />
      <Skeleton animation="wave" class="col-span-2 row-span-1 h-full w-20% inline-flex items-end justify-self-end rounded-2xl pr-4 text-gray-500 dark:text-gray-400" />
    </Skeleton>
    <div v-else bg="blue-100 dark:blue-900" rounded-2xl py-2 pl-3 pr-1 class="grid grid-cols-4 grid-rows-3 max-h-35 gap-2">
      <div class="grid-col-span-3 text-lg font-semibold">
        {{ props.city }}
      </div>
      <img :src="ClearDay" alt="Weather Icon" class="col-span-1 row-span-2 h-full w-auto justify-self-end">
      <div class="col-span-2 row-span-2 h-full inline-flex items-end text-gray-600 font-thin dark:text-gray-300">
        <span class="text-[3.5rem] font-thin leading-[1]">{{ props.temperature }}</span>
      </div>
      <div class="col-span-2 row-span-1 h-full w-full inline-flex items-end justify-end pr-4 text-gray-500 dark:text-gray-400">
        <span>{{ props.condition }}</span>
      </div>
    </div>
  </div>
</template>
