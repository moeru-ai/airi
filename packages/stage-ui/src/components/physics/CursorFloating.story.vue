<script setup lang="ts">
import CursorFloating from './CursorFloating.vue'
</script>

<template>
  <Story
    title="Cursor Floating"
    group="physics"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <Variant
      id="basic"
      title="Basic"
    >
      <div class="h-40 flex items-center justify-center">
        <CursorFloating>
          <div class="h-20 w-20 bg-primary-500/20" />
        </CursorFloating>
      </div>
    </Variant>

    <Variant
      id="with-content"
      title="With Content"
    >
      <div class="h-40 flex items-center justify-center">
        <CursorFloating>
          <div class="rounded-lg bg-white p-4 dark:bg-neutral-900">
            <h3 class="text-lg font-bold">
              Card Title
            </h3>
            <p class="text-sm text-neutral-500">
              Card description goes here
            </p>
          </div>
        </CursorFloating>
      </div>
    </Variant>

    <Variant
      id="interactive"
      title="Interactive"
    >
      <div class="h-40 flex items-center justify-center">
        <CursorFloating>
          <div class="cursor-pointer rounded-lg bg-white p-4 dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800">
            <div class="flex items-center gap-2">
              <div class="i-solar:check-circle-bold-duotone text-primary-500" />
              <span>Click me!</span>
            </div>
          </div>
        </CursorFloating>
      </div>
    </Variant>
  </Story>
</template>
