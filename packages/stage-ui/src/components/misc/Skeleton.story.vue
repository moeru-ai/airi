<script setup lang="ts">
import Skeleton from './Skeleton.vue'
</script>

<template>
  <Story
    title="Skeleton"
    group="misc"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="basic"
      title="Basic Skeleton"
    >
      <div class="space-y-4">
        <Skeleton class="h-6 w-full rounded-lg" />
        <Skeleton class="h-6 w-3/4 rounded-lg" />
        <Skeleton class="h-6 w-1/2 rounded-lg" />
      </div>
    </Variant>

    <Variant
      id="pulse-animation"
      title="Pulse Animation"
    >
      <div class="space-y-4">
        <Skeleton animation="pulse" class="h-6 w-full rounded-lg" />
        <Skeleton animation="pulse" class="h-6 w-3/4 rounded-lg" />
        <Skeleton animation="pulse" class="h-6 w-1/2 rounded-lg" />
      </div>
    </Variant>

    <Variant
      id="wave-animation"
      title="Wave Animation"
    >
      <div class="space-y-4">
        <Skeleton animation="wave" class="h-6 w-full rounded-lg" />
        <Skeleton animation="wave" class="h-6 w-3/4 rounded-lg" />
        <Skeleton animation="wave" class="h-6 w-1/2 rounded-lg" />
      </div>
    </Variant>

    <Variant
      id="no-animation"
      title="No Animation"
    >
      <div class="space-y-4">
        <Skeleton animation="none" class="h-6 w-full rounded-lg" />
        <Skeleton animation="none" class="h-6 w-3/4 rounded-lg" />
        <Skeleton animation="none" class="h-6 w-1/2 rounded-lg" />
      </div>
    </Variant>

    <Variant
      id="card-loading"
      title="Card Loading State"
    >
      <div class="border border-neutral-200 rounded-xl p-4 space-y-4 dark:border-neutral-800">
        <Skeleton class="h-40 w-full rounded-lg" />
        <Skeleton class="h-5 w-3/4 rounded-md" />
        <Skeleton class="h-16 w-full rounded-md" />
        <div class="flex gap-2">
          <Skeleton class="h-8 w-16 rounded-md" />
          <Skeleton class="h-8 w-16 rounded-md" />
        </div>
      </div>
    </Variant>

    <Variant
      id="profile-loading"
      title="Profile Loading State"
    >
      <div class="flex items-center gap-4">
        <Skeleton class="h-16 w-16 rounded-full" />
        <div class="flex-1 space-y-2">
          <Skeleton class="h-5 w-1/3 rounded-md" />
          <Skeleton class="h-4 w-2/3 rounded-md" />
          <Skeleton class="h-4 w-1/4 rounded-md" />
        </div>
      </div>
    </Variant>

    <Variant
      id="form-loading"
      title="Form Loading State"
    >
      <div class="space-y-6">
        <div class="space-y-1">
          <Skeleton class="h-5 w-24 rounded-md" />
          <Skeleton class="h-4 w-32 rounded-md" />
          <Skeleton class="mt-2 h-10 w-full rounded-lg" />
        </div>

        <div class="space-y-1">
          <Skeleton class="h-5 w-32 rounded-md" />
          <Skeleton class="h-4 w-40 rounded-md" />
          <Skeleton class="mt-2 h-10 w-full rounded-lg" />
        </div>

        <div class="space-y-1">
          <Skeleton class="h-5 w-36 rounded-md" />
          <Skeleton class="h-4 w-28 rounded-md" />
          <Skeleton class="mt-2 h-24 w-full rounded-lg" />
        </div>

        <Skeleton class="h-10 w-24 rounded-md" />
      </div>
    </Variant>

    <Variant
      id="table-loading"
      title="Table Loading State"
    >
      <div class="overflow-hidden border border-neutral-200 rounded-lg dark:border-neutral-800">
        <div class="flex border-b border-neutral-200 bg-neutral-100 p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <Skeleton class="h-6 w-1/4 rounded-md" />
          <Skeleton class="ml-4 h-6 w-1/4 rounded-md" />
          <Skeleton class="ml-4 h-6 w-1/4 rounded-md" />
          <Skeleton class="ml-4 h-6 w-1/4 rounded-md" />
        </div>
        <div v-for="i in 5" :key="i" class="flex border-b border-neutral-200 p-4 dark:border-neutral-800">
          <Skeleton class="h-6 w-1/4 rounded-md" />
          <Skeleton class="ml-4 h-6 w-1/4 rounded-md" />
          <Skeleton class="ml-4 h-6 w-1/4 rounded-md" />
          <Skeleton class="ml-4 h-6 w-1/4 rounded-md" />
        </div>
      </div>
    </Variant>
  </Story>
</template>
