<script setup lang="ts">
import type { VNode } from 'vue'

import { Icon } from '@iconify/vue'
import { useVModel } from '@vueuse/core'
import { SelectContent, SelectItem, SelectItemIndicator, SelectItemText, SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport, TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { capitalize, computed, ref, useSlots, watch } from 'vue'

defineOptions({
  inheritAttrs: false,
})
const props = defineProps<{
  modelValue: 'css' | 'tailwind' | 'pinceau'
  type?: 'demo' | 'example'

}>()
const emits = defineEmits<{
  'update:modelValue': [payload: 'css' | 'tailwind' | 'pinceau']
}>()
const cssFramework = useVModel(props, 'modelValue', emits)

const slots = useSlots()
const slotsFramework = computed(() => slots.default?.().map(slot => slot.props?.key?.toString()?.replace('_', '')) ?? [])

const cssFrameworkOptions = computed(() => [
  { label: 'Tailwind 3', value: 'tailwind', icon: 'devicon:tailwindcss' },
  { label: 'CSS', value: 'css', icon: 'devicon:css3' },
  { label: 'Pinceau', value: 'pinceau' },
].filter(i => slotsFramework.value.includes(i.value)))

const tabs = computed(
  () => {
    const currentFramework = slots.default?.().find(slot => slot.props?.key?.toString().includes(cssFramework.value))
    const childSlots = (currentFramework?.children as VNode[]).sort((a, b) => a?.props?.name?.localeCompare(b?.props?.name))
    return childSlots?.map((slot, index) => {
      return {
        label: slot.props?.name || `${index}`,
        component: slot,
      }
    }) || []
  },
)

const open = ref(false)

const codeScrollWrapper = ref<HTMLElement | undefined>()
const currentTab = ref('index.vue')

watch(open, () => {
  if (!open.value) {
    codeScrollWrapper.value!.scrollTo({
      top: 0,
    })
  }
})
</script>

<template>
  <TabsRoot
    v-model="currentTab"
    class="overflow-hidden border border-[hsl(0_0%_15%)] rounded-xl bg-[hsl(141_17%_5%)]"
    :unmount-on-hide="false"
    @update:model-value="open = true"
  >
    <div class="flex border-b-2 border-[hsl(0_0%_15%)] bg-[hsl(141_17%_5%)] pr-2">
      <div class="w-full flex items-center justify-between text-[13px]">
        <TabsList class="flex">
          <TabsTrigger
            v-for="(tab, index) in tabs"
            :key="index"
            :value="tab.label"
            tabindex="-1"
            class="border-box px-4 py-2.5 text-white/70 data-[state=active]:text-white data-[state=active]:font-medium data-[state=active]:shadow-[0_1px_0_#10b981]"
          >
            {{ tab.label }}
          </TabsTrigger>
        </TabsList>
        <div v-if="type === 'demo'">
          <SelectRoot
            v-model="cssFramework"
            @update:model-value="currentTab = 'index.vue'"
          >
            <SelectTrigger
              class="hover:bg-code w-32 flex items-center justify-between rounded px-2 py-1.5 text-xs text-white disabled:opacity-50"
              aria-label="Select CSS framework"
            >
              <div class="inline-flex items-center gap-2">
                <Icon
                  :icon="cssFrameworkOptions.find(opt => opt.value === cssFramework)?.icon ?? ''"
                  class="text-base"
                />

                <SelectValue>
                  {{ cssFrameworkOptions.find(opt => opt.value === cssFramework)?.label }}
                </SelectValue>
              </div>

              <Icon
                icon="lucide:chevron-down"
                class="h-3.5 w-3.5"
              />
            </SelectTrigger>

            <SelectPortal>
              <SelectContent class="bg-code will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade z-[100] min-w-32 border border-stone-700 rounded-md shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)]">
                <SelectViewport class="p-[5px]">
                  <SelectItem
                    v-for="framework in cssFrameworkOptions"
                    :key="framework.label"
                    class="data-[disabled]:text-mauve8 relative h-[25px] flex select-none items-center rounded-[3px] pl-[25px] text-xs text-white leading-none data-[disabled]:pointer-events-none data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary data-[state=checked]:text-primary data-[highlighted]:outline-none"
                    :value="framework.value"
                  >
                    <SelectItemIndicator class="absolute left-0 w-[25px] inline-flex items-center justify-center">
                      <Icon icon="lucide:check" />
                    </SelectItemIndicator>

                    <SelectItemText>
                      {{ capitalize(framework.label ?? '') }}
                    </SelectItemText>
                  </SelectItem>
                </SelectViewport>
              </SelectContent>
            </SelectPortal>
          </SelectRoot>
        </div>
      </div>
    </div>
    <div
      ref="codeScrollWrapper"
      :key="cssFramework"
      class="max-h-[50vh] overflow-auto"
    >
      <TabsContent
        v-for="tab in tabs"
        :key="tab.label"
        :value="tab.label"
        as-child
      >
        <div class="relative text-base">
          <component
            :is="tab.component"
            class="border-0 !mb-0"
          />
        </div>
      </TabsContent>
    </div>
  </TabsRoot>
</template>
