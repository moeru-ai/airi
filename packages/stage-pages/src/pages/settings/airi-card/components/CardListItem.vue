<script setup lang="ts">
import { CursorFloating } from '@proj-airi/stage-ui/components'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed } from 'vue'

interface Props {
  id: string
  name: string
  description?: string
  isActive: boolean
  isSelected: boolean
  version: string
  consciousnessModel: string
  voiceModel: string
  displayModelId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'select'): void
  (e: 'activate'): void
  (e: 'delete'): void
  (e: 'edit'): void
  (e: 'exportJson'): void
  (e: 'exportPng'): void
}>()

const displayModelsStore = useDisplayModelsStore()
const portrait = computed(() => {
  if (!props.displayModelId)
    return null
  const model = displayModelsStore.displayModels.find(m => m.id === props.displayModelId)
  return model?.previewImage || null
})
</script>

<template>
  <CursorFloating
    relative min-h-120px flex="~ col" cursor-pointer overflow-hidden rounded-xl
    :class="[
      isSelected
        ? 'border-2 border-primary-400 dark:border-primary-600'
        : 'border-2 border-neutral-100 dark:border-neutral-800/25',
    ]"
    bg="neutral-200/50 dark:neutral-800/50"
    drop-shadow="none hover:[0px_4px_4px_rgba(220,220,220,0.4)] active:[0px_0px_0px_rgba(220,220,220,0.25)] dark:hover:none"
    transition="all ease-in-out duration-400"
    before="content-empty absolute inset-0 z-0 w-25% h-full transition-all duration-400 ease-in-out bg-gradient-to-r from-primary-500/0 to-primary-500/0 dark:from-primary-400/0 dark:to-primary-400/0 mask-image-[linear-gradient(120deg,white_100%)] opacity-0"
    hover="before:(opacity-100 bg-gradient-to-r from-primary-500/20 via-primary-500/10 to-transparent dark:from-primary-400/20 dark:via-primary-400/10 dark:to-transparent)"
    class="group perspective-1000"
    @click="emit('select')"
  >
    <!-- Flip container -->
    <div
      class="preserve-3d relative w-full flex-1 transition-transform duration-600 ease-in-out group-hover:rotate-y-180"
    >
      <!-- Front side (Determines height) -->
      <div class="backface-hidden relative h-full w-full flex flex-col">
        <!-- Card content -->
        <div
          relative flex="~ col 1" justify-between gap-3 overflow-hidden rounded-lg bg="white dark:neutral-900" p-5
          transition="all ease-in-out duration-400"
          after="content-empty absolute inset-0 z--2 w-full h-full bg-dotted-[neutral-200/80] bg-size-10px mask-image-[linear-gradient(165deg,white_30%,transparent_50%)] transition-all duration-400 ease-in-out"
          hover="after:bg-dotted-[primary-300/50] dark:after:bg-dotted-[primary-200/20] text-primary-600/80 dark:text-primary-300/80"
        >
          <!-- Card header (name and badge) -->
          <div z-1 flex items-start justify-between gap-2>
            <h3 flex-1 truncate text-lg font-normal>
              {{ name }}
            </h3>
            <div flex shrink-0 items-center gap-2>
              <div v-if="isActive" rounded-md p-1 bg="primary-100 dark:primary-900/40" text="primary-600 dark:primary-400">
                <div i-solar:check-circle-bold-duotone text-sm />
              </div>
            </div>
          </div>

          <!-- Card description -->
          <p v-if="description" line-clamp-3 min-h-40px flex-1 text-sm text="neutral-500 dark:neutral-400">
            {{ description }}
          </p>

          <!-- Card stats -->
          <div z-1 flex items-center justify-between text-xs text="neutral-500 dark:neutral-400">
            <div>v{{ version }}</div>
            <div flex items-center gap-1.5>
              <div flex items-center gap-0.5>
                <div i-lucide:ghost text-xs />
                <span>{{ consciousnessModel }}</span>
              </div>
              <div flex items-center gap-0.5>
                <div i-lucide:mic text-xs />
                <span>{{ voiceModel }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Back side (Portrait) -->
      <div
        class="dark:neutral-900 backface-hidden rotate-y-180 absolute inset-0 flex flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        border="2 solid primary-500/20 dark:primary-400/10"
      >
        <div v-if="portrait" class="relative h-full w-full">
          <img
            :src="portrait"
            class="h-full w-full object-cover object-[center_15%]"
            alt="Portrait"
          >
          <div class="absolute inset-x-0 bottom-0 from-black/80 via-black/40 to-transparent bg-gradient-to-t p-3">
            <span class="text-sm text-white font-semibold tracking-wide uppercase drop-shadow-sm">{{ name }}</span>
          </div>
        </div>
        <div v-else class="h-full w-full flex flex-col items-center justify-center gap-2 bg-neutral-100 text-neutral-400 dark:bg-neutral-800/80">
          <div i-solar:user-circle-bold-duotone text-5xl opacity-40 />
          <span class="text-xs font-medium tracking-widest uppercase opacity-60">{{ name }}</span>
        </div>
      </div>
    </div>

    <!-- Fixed Actions Toolbar (outside flip) -->
    <div relative z-10 flex items-center justify-end px-2 py-1.5 bg="neutral-50/50 dark:neutral-800/30" border-t="1 solid neutral-100 dark:neutral-800/50">
      <button
        rounded-lg p-1.5 text-neutral-500 transition-colors dark:text-neutral-400 hover="bg-neutral-200 dark:bg-neutral-700/50"
        title="Edit card"
        @click.stop="emit('edit')"
      >
        <div i-solar:pen-2-bold-duotone text-sm />
      </button>

      <DropdownMenuRoot>
        <DropdownMenuTrigger
          rounded-lg p-1.5 text-neutral-500 transition-colors dark:text-neutral-400 hover="bg-neutral-200 dark:bg-neutral-700/50"
          title="Export card"
          @click.stop
        >
          <div i-solar:export-bold-duotone text-sm />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="z-10000 min-w-28 border border-neutral-200 rounded-lg bg-white p-1 text-sm text-neutral-800 shadow-xl outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            align="end"
            side="bottom"
            :side-offset="6"
          >
            <DropdownMenuItem
              class="cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800"
              @click.stop="emit('exportJson')"
            >
              Export JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              class="cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800"
              @click.stop="emit('exportPng')"
            >
              Export PNG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>

      <button
        rounded-lg p-1.5 transition-colors hover="bg-neutral-200 dark:bg-neutral-700/50"
        :disabled="isActive"
        @click.stop="emit('activate')"
      >
        <div
          :class="[
            isActive
              ? 'i-solar:check-circle-bold-duotone text-primary-500 dark:text-primary-400'
              : 'i-solar:play-circle-broken text-neutral-500 dark:text-neutral-400',
          ]"
        />
      </button>

      <button
        v-if="id !== 'default'"
        rounded-lg p-1.5 transition-colors hover="bg-neutral-200 dark:bg-neutral-700/50"
        @click.stop="emit('delete')"
      >
        <div i-solar:trash-bin-trash-linear text="neutral-500 dark:neutral-400" />
      </button>
    </div>
  </CursorFloating>
</template>
