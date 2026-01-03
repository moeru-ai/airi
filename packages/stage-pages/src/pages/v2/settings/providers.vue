<script setup lang="ts">
import { PaneArea } from '@proj-airi/stage-ui/components'
import { getDefinedProvider, listProviders } from '@proj-airi/stage-ui/libs'
import { useProviderCatalogStore } from '@proj-airi/stage-ui/stores/provider-catalog'
import { Button, Input } from '@proj-airi/ui'
import { breakpointsTailwind, refDebounced, useBreakpoints } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { Pane, Splitpanes } from 'splitpanes'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const providerCatalogStore = useProviderCatalogStore()
const { configs } = storeToRefs(providerCatalogStore)

const availableProviderSearchQuery = ref('')
const availableProviderSearchQueryDebounced = refDebounced(availableProviderSearchQuery, 250)

const availableProviders = computed(() => {
  return listProviders().map(provider => ({
    ...provider,
    nameLocalized: provider.nameLocalize({ t }),
  }))
})

const availableProvidersFiltered = computed(() => {
  if (!availableProviderSearchQueryDebounced.value) {
    return availableProviders.value
  }

  return availableProviders.value.filter(provider =>
    provider.name.toLowerCase().includes(availableProviderSearchQueryDebounced.value.toLowerCase()),
  )
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const isSmallerThan2XL = breakpoints.smaller('2xl')

const paneDatasourceListSize = computed(() => isSmallerThan2XL.value ? 30 : 20)
const paneDatasourceEditSize = computed(() => isSmallerThan2XL.value ? 80 : 70)

function handleAdd(providerId: string) {
  providerCatalogStore.addProvider(providerId)
}

function handleClick(providerId: string) {
  router.push(`/v2/settings/providers/edit/${providerId}`)
}
</script>

<template>
  <div h-full w-full flex flex-col gap-2>
    <h2 text="neutral-900 dark:neutral-100" mb-1 flex justify-between>
      Provider Catalog
    </h2>
    <Splitpanes class="flex gap-0.8 bg-transparent">
      <Pane :min-size="10" :size="paneDatasourceListSize">
        <PaneArea
          :class="[
            'flex flex-col gap-2',
            'bg-neutral-50/90 dark:bg-neutral-900/90',
          ]"
        >
          <div relative h-full w-full flex flex-col gap-2>
            <div relative flex flex-1 flex-col gap-2>
              <div :class="['flex flex-row items-center gap-2']">
                <Input placeholder="Search configured..." variant="primary-dimmed" />

                <DropdownMenuRoot>
                  <DropdownMenuTrigger as-child aria-label="Customize options">
                    <Button size="sm">
                      <div i-ph:plus-light />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuPortal>
                    <DropdownMenuContent
                      :class="[
                        'bg-white', 'dark:bg-neutral-800/90',
                        'shadow-md', 'dark:shadow-lg',
                        'backdrop-blur-md',
                        'will-change-[opacity,transform] min-w-[400px] rounded-xl p-2 outline-none',
                        'data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade',
                      ]"
                      :side-offset="8"
                      align="start"
                    >
                      <Input v-model="availableProviderSearchQuery" placeholder="Search supported providers..." class="mb-2" variant="primary-dimmed" />

                      <div flex flex-col gap-1>
                        <div v-for="(provider) in availableProvidersFiltered" :key="provider.id" @click="() => handleAdd(provider.id)">
                          <div
                            bg="hover:neutral-200/80 dark:hover:neutral-700/80"
                            transition="all duration-100 ease-out"
                            flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1 text-sm
                          >
                            <div class="relative w-4">
                              <div :class="[provider.iconColor || provider.icon, 'absolute left-50% top-50% -translate-x-1/2 -translate-y-1/2']" />
                            </div>
                            <div>{{ provider?.name }}</div>
                          </div>
                        </div>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenuRoot>
              </div>

              <div v-if="Object.keys(configs).length === 0" class="text-neutral-500 <lg:px-4" flex flex-1 flex-col items-center justify-center gap-2>
                <div i-ph:rectangle-dashed-light text-4xl />
                <div flex items-center justify-center gap-2>
                  <span>No providers</span>
                </div>
              </div>

              <div v-auto-animate gap="0.5" h-fit max-h="[calc(100dvh-12.5rem)]" flex flex-col overflow-y-scroll>
                <div
                  v-for="(providerEntry, index) in Object.entries(configs)"
                  :key="index"
                  @click="() => handleClick(providerEntry[0])"
                >
                  <div
                    bg="hover:neutral-200/80 dark:hover:neutral-700/80"
                    transition="all duration-100 ease-out"
                    flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1 text-sm
                  >
                    <div class="relative w-4">
                      <div :class="[getDefinedProvider(providerEntry[1].definitionId)?.iconColor || getDefinedProvider(providerEntry[1].definitionId)?.icon, 'absolute left-50% top-50% -translate-x-1/2 -translate-y-1/2']" />
                    </div>
                    <div>{{ providerEntry[1].name }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PaneArea>
      </Pane>
      <Pane :min-size="20" :size="paneDatasourceEditSize">
        <PaneArea flex flex-col gap-2>
          <RouterView />
        </PaneArea>
      </Pane>
    </Splitpanes>
  </div>
</template>
