<script setup lang="ts">
import { Label, SwitchRoot, SwitchThumb } from 'reka-ui'
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    overflow?: boolean
    folder?: string
    files?: string[]
    cssFramework?: string
    type?: 'demo' | 'example'
  }>(),
  { folder: '', files: () => [] },
)

const isCodeView = ref(false)
const sources = ref<Record<string, string>>({})

watch(() => props.cssFramework, () => {
  sources.value = {} // reset sources everytime the value changes
  props.files?.forEach((file) => {
    const [folder, fileName] = file.split('/')
    const extension = file.split('.').pop()

    if (props.type === 'demo') {
      import(`../../components/demo/${props.folder}/${folder}/${fileName.replace(`.${extension}`, '')}.${extension}?raw`).then(
        res => (sources.value[fileName] = res.default),
      )
    }
    else {
      import(`../../components/examples/${props.folder}/${file.replace(`.${extension}`, '')}.${extension}?raw`).then(
        res => (sources.value[file] = res.default),
      )
    }
  })
}, { immediate: true })
</script>

<template>
  <div
    class="relative text-sm text-black"
    :class="{ 'my-4': type === 'example' }"
  >
    <div class="w-full flex justify-end">
      <div class="text-foreground mb-4 flex items-center">
        <Label
          for="view-code"
          class="text-sm font-medium"
        >
          View code
        </Label>
        <SwitchRoot
          id="view-code"
          v-model="isCodeView"
          class="relative ml-2 h-5 w-[34px] flex rounded-full transition data-[state=checked]:bg-primary data-[state=unchecked]:bg-primary/50"
          aria-label="View code"
        >
          <SwitchThumb
            class="my-auto h-4 w-4 flex translate-x-0.5 items-center justify-center rounded-full bg-white text-xs shadow-xl transition-transform will-change-transform data-[state=checked]:translate-x-full"
          />
        </SwitchRoot>
      </div>
    </div>

    <div
      v-if="!isCodeView"
      class="not-prose bg-card border-muted relative min-h-[400px] w-full flex items-center justify-center border rounded-xl p-4 backdrop-blur-2xl"
      :class="{ 'overflow-x-auto': overflow }"
    >
      <div class="custom-justify-center max-w-[700px] w-full flex items-center py-12 sm:py-[100px]">
        <slot />
      </div>
    </div>

    <div v-else>
      <slot name="codeSlot" />
    </div>
  </div>
</template>

<style scoped>
:deep(li) {
  margin-top: 0 !important;
}

:deep(h3) {
  margin: 0px !important;
  font-weight: unset !important;
}

:deep(pre) {
  z-index: 0 !important;
}
</style>
