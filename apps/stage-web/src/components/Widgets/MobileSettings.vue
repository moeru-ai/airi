<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ModelProviderSettings from './ModelProviderSettings.vue'

const { t } = useI18n()
const settings = storeToRefs(useSettings())

const dark = useDark({ disableTransition: false })
const currentView = ref('main')
const slideDirection = ref('forward') // 'forward' | 'backward'

function handleLanguageChange(event: Event) {
  const target = event.target as HTMLSelectElement
  settings.language.value = target.value
}

function navigateToProviders() {
  slideDirection.value = 'forward'
  currentView.value = 'providers'
}

function navigateToLive2D() {
  slideDirection.value = 'forward'
  currentView.value = 'live2d'
}

function navigateBack() {
  slideDirection.value = 'backward'
  currentView.value = 'main'
}
</script>

<template>
  <div text="zinc-500 dark:zinc-400" class="relative">
    <Transition :name="slideDirection === 'forward' ? 'slide-forward' : 'slide-backward'">
      <!-- Main Settings View -->
      <div v-if="currentView === 'main'" key="main">
        <h2 text="zinc-800/80 dark:zinc-200/80 xl" mb-4 font-bold>
          {{ t('settings.title') }}
        </h2>
        <div>
          <!-- Model Providers Navigation Item -->
          <div class="space-y-2">
            <div
              grid="~ cols-[150px_1fr]"
              bg="zinc-100 dark:zinc-800"
              hover="bg-zinc-200 dark:bg-zinc-700"
              transition="all ease-in-out duration-250"
              cursor-pointer items-center gap-1.5 rounded-lg px-4 py-3
              @click="navigateToProviders"
            >
              <div text="sm">
                <span>{{ t('settings.model-provider.title') }}</span>
              </div>
              <div flex="~ row" w-full justify-end text="sm">
                <div i-solar:alt-arrow-right-bold-duotone />
              </div>
            </div>

            <!-- Language Setting -->
            <div
              grid="~ cols-[150px_1fr]"
              bg="zinc-100 dark:zinc-800"
              hover="bg-zinc-200 dark:bg-zinc-700"
              transition="all ease-in-out duration-250"
              items-center gap-1.5 rounded-lg px-4 py-3
            >
              <div text="sm">
                <span>{{ t('settings.language.title') }}</span>
              </div>
              <div flex="~ row" w-full justify-end>
                <select
                  class="w-32"
                  bg="transparent"
                  text="sm right zinc-800 dark:zinc-100"
                  transition="all ease-in-out duration-250"
                  outline="none"
                  @change="handleLanguageChange"
                >
                  <option value="en-US">
                    {{ t('settings.language.english') }}
                  </option>
                  <option value="zh-CN">
                    {{ t('settings.language.chinese') }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Theme Setting -->
            <label
              bg="zinc-100 dark:zinc-800"
              hover="bg-zinc-200 dark:bg-zinc-700"
              transition="all ease-in-out duration-250"
              w-full flex cursor-pointer rounded-lg px-4 py-3
            >
              <input
                v-model="dark"
                text="zinc-800 dark:zinc-100"
                :checked="dark"
                :aria-checked="dark"
                type="checkbox"
                hidden appearance-none outline-none
              >
              <div flex="~ row" w-full items-center gap-1.5>
                <div text="sm" w-full flex-1>
                  <span>{{ t('settings.theme') }}</span>
                </div>
                <div select-none>
                  <Transition name="slide-away" mode="out-in">
                    <div
                      v-if="dark"
                      i-solar:moon-stars-bold-duotone
                      transition="all ease-in-out duration-250"
                    />
                    <div
                      v-else
                      i-solar:sun-fog-bold-duotone
                      transition="all ease-in-out duration-250"
                    />
                  </Transition>
                </div>
              </div>
            </label>
            <!-- Live2D Setting -->
            <div
              grid="~ cols-[150px_1fr]"
              bg="zinc-100 dark:zinc-800"
              hover="bg-zinc-200 dark:bg-zinc-700"
              transition="all ease-in-out duration-250"
              cursor-pointer items-center gap-1.5 rounded-lg px-4 py-3
              @click="navigateToLive2D"
            >
              <div text="sm">
                <span>{{ t('settings.live2d.title') }}</span>
              </div>
              <div flex="~ row" w-full justify-end>
                <div i-solar:alt-arrow-right-bold-duotone />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Model Providers View -->
      <div v-else-if="currentView === 'providers'" key="providers">
        <div mb-4 flex items-center gap-2>
          <button
            text="zinc-800/80 dark:zinc-200/80"
            @click="navigateBack"
          >
            <div i-solar:alt-arrow-left-bold-duotone />
          </button>
          <h2 text="zinc-800/80 dark:zinc-200/80 xl" font-bold>
            {{ t('settings.model-provider.title') }}
          </h2>
        </div>
        <ModelProviderSettings />
      </div>
      <!-- Live2D Settings View -->
      <div v-else-if="currentView === 'live2d'" key="live2d">
        <div mb-4 flex items-center gap-2>
          <button
            text="zinc-800/80 dark:zinc-200/80"
            @click="navigateBack"
          >
            <div i-solar:alt-arrow-left-bold-duotone />
          </button>
          <h2 text="zinc-800/80 dark:zinc-200/80 xl" font-bold>
            {{ t('settings.live2d.title') }}
          </h2>
        </div>
        <Live2DSettings />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Forward navigation transitions */
.slide-forward-enter-active,
.slide-forward-leave-active {
  transition: all 0.2s ease;
  position: absolute;
  width: 100%;
}

.slide-forward-enter-from {
  transform: translateX(100%);
}

.slide-forward-leave-to {
  transform: translateX(-30%);
  opacity: 0;
}

.slide-forward-enter-to,
.slide-forward-leave-from {
  transform: translateX(0);
}

/* Backward navigation transitions */
.slide-backward-enter-active,
.slide-backward-leave-active {
  transition: all 0.2s ease;
  position: absolute;
  width: 100%;
}

.slide-backward-enter-from {
  transform: translateX(-30%);
  opacity: 0;
}

.slide-backward-leave-to {
  transform: translateX(100%);
}

.slide-backward-enter-to,
.slide-backward-leave-from {
  transform: translateX(0);
}
</style>
