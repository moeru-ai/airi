<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  focus?: boolean
  frame?: boolean
  transparent?: boolean
  titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover'
  hasShadow?: boolean
  alignTo?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'center'
}>(), {
  focus: true,
  frame: true,
  transparent: false,
  titleBarStyle: 'default',
  hasShadow: true,
})
</script>

<template>
  <div
    :class="[
      'absolute',
      'flex flex-col',
      'rounded-2xl overflow-hidden',
      props.hasShadow ? 'shadow-xl' : '',
    ]"
  >
    <div
      v-if="!!props.frame"
      :class="[
        'flex gap-2 px-2.5 py-2',
        'bg-white',
      ]"
    >
      <div
        :class="[
          'flex gap-2',
        ]"
      >
        <div :class="['bg-[#FF5C5F] dark:bg-[#FF5C5F]', 'size-3.5', 'rounded-full']" />
        <div :class="['bg-[#FAC800] dark:bg-[#FAC800]', 'size-3.5', 'rounded-full']" />
        <div :class="['bg-[#34C759] dark:bg-[#34C759]', 'size-3.5', 'rounded-full']" />
      </div>
      <div v-if="props.title">
        <span>{{ props.title }}</span>
      </div>
    </div>
    <div
      v-if="!!props.frame"
      :class="[
        'bg-[#E6E6E6] h-0.25 w-full',
      ]"
    />
    <div>
      <slot />
    </div>
  </div>
</template>
