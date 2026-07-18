<script setup lang="ts">
interface Props {
  label: string
  name: string
}

const props = defineProps<Props>()
const color = defineModel<string>('color', { required: true })
</script>

<template>
  <div class="color-picker-control" mb-3>
    <div mb-1 flex items-center gap-2>
      <label text-sm>{{ props.label }}</label>
    </div>
    <input
      v-model="color"
      type="color"
      class="color-input"
      w-full px-0.5
    >
  </div>
</template>

<style scoped>
.color-input {
  --at-apply: appearance-none rounded-lg h-8 w-full cursor-pointer;
  border: 1px solid rgb(var(--color-neutral-300));
}

.htw-dark .color-input {
  border-color: rgb(var(--color-neutral-700));
}

.color-input::-webkit-color-swatch {
  --at-apply: rounded-md border-0;
}

.color-input::-moz-color-swatch {
  --at-apply: rounded-md border-0;
}
</style>
