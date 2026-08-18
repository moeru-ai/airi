<script setup lang="ts">
</script>

<template>
  <div
    :class="[
      'inline-flex flex-col justify-center items-center',
      'relative',
      'size-4 m-1 translate-y--0.8',
    ]"
  >
    <div
      :class="[
        'absolute order-1',
        'text-base scale-75',
        'i-mdi:toggle-switch',
      ]"
    />
    <div
      :class="[
        'translate-y-1.75 absolute order-2',
        'text-base scale-67',
        'i-mdi:toggle-switch-off-outline',
      ]"
    />
  </div>
</template>
