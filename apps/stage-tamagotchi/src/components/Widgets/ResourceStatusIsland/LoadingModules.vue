<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import WindowRouterLink from '../../Tauri/WindowRouterLink.vue'
import LoadingComponent from './LoadingComponent.vue'

import { useResourcesStore } from '../../../stores/resources'

const { t } = useI18n()

const { resources, pendingResources, atLeastOneLoading } = storeToRefs(useResourcesStore())

const totalProgress = computed(() => {
  return Array
    .from(resources.value.values())
    .reduce((acc, module) => {
      return acc + Array
        .from(module.value.components.values())
        .reduce((acc, component) => {
          return acc + Array
            .from(component.files.values())
            .reduce((acc, file) => acc + file.progress, 0)
        }, 0)
    }, 0)
})
</script>

<template>
  <div flex flex-col gap-3>
    <div>
      <div v-if="atLeastOneLoading" flex items-center gap-2 text="sm orange-600 dark:orange-400">
        <div i-solar:danger-triangle-bold-duotone />
        <div text-nowrap>
          Some modules haven't been available yet...
        </div>
      </div>
      <div v-else flex items-center gap-2 text="sm green-600 dark:green-400">
        <div i-solar:check-circle-bold-duotone />
        <div text-nowrap>
          All modules are ready!
        </div>
      </div>
      <ul ml-4 mt-3>
        <li v-for="[moduleName, module] in resources" :key="moduleName">
          <WindowRouterLink :to="`/settings/modules/${moduleName}`" label="settings">
            <div flex items-center gap-1>
              <div flex items-center gap-1>
                <div i-solar:microphone-3-bold-duotone text="neutral-500 dark:neutral-400" />
                <span decoration-underline decoration-dashed>{{ t(`settings.pages.modules.${moduleName}.title`) }}</span>
              </div>
              <div v-if="module.value.reason" text="neutral-500 dark:neutral-400 nowrap">
                {{ module.value.reason }}
              </div>
            </div>
          </WindowRouterLink>
        </li>
      </ul>
    </div>
    <div flex items-center gap-2 text-sm>
      <div v-if="totalProgress < 100" i-svg-spinners:pulse-ring />
      <div v-else i-solar:check-circle-bold-duotone text="neutral-500 dark:neutral-400" />
      <div v-if="Array(pendingResources.values()).length > 0">
        Preparing resources...
      </div>
    </div>
    <div v-if="Array(pendingResources.values()).length > 0" max-w="100%" max-h="[calc(50dvh)]" w-full flex flex-col gap-2 overflow-x-hidden overflow-y-scroll scrollbar="none">
      <div v-for="[moduleName, module] in pendingResources" :key="moduleName" flex flex-col gap-2>
        <div v-for="[componentName, component] in module.value.components" :key="componentName" flex flex-col gap-2>
          <LoadingComponent :component="component" />
        </div>
      </div>
    </div>
  </div>
</template>
