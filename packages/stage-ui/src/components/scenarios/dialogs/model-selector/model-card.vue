<script setup lang="ts">
import type { ListedDisplayModel } from './use-listed-display-models'

import { Progress } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger, EditableArea, EditableEditTrigger, EditableInput, EditablePreview, EditableRoot, EditableSubmitTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'

import { DisplayModelFormat, useDisplayModelsStore } from '../../../../stores/display-models'

const props = withDefaults(defineProps<{
  model: ListedDisplayModel
  /** Draws the selection ring around the preview. @default false */
  highlighted?: boolean
  /** The size classes of the preview. The model picker and the model library lay the card out differently. */
  previewClass?: string | string[]
}>(), {
  highlighted: false,
  previewClass: 'h-full min-w-80 w-full lg:min-h-60 md:min-w-70 sm:min-w-65',
})

const displayModelStore = useDisplayModelsStore()
const { syncStatuses, syncErrors, uploadProgress } = storeToRefs(displayModelStore)
const { t } = useI18n()

// The card store removes the references to a deleted model. A model that the account
// keeps stays referenced, because it can download again.
async function handleRemoveModel(model: { id: string }) {
  await displayModelStore.removeDisplayModel(model.id)
}

const mapFormatRenderer: Record<DisplayModelFormat, string> = {
  [DisplayModelFormat.Live2dZip]: 'Live2D',
  [DisplayModelFormat.Live2dDirectory]: 'Live2D',
  [DisplayModelFormat.VRM]: 'VRM',
  [DisplayModelFormat.SpineZip]: 'Spine',
  [DisplayModelFormat.TachieZip]: 'Tachie',
  [DisplayModelFormat.PMXDirectory]: 'MMD',
  [DisplayModelFormat.PMXZip]: 'MMD',
  [DisplayModelFormat.PMD]: 'MMD',
}
</script>

<template>
  <!--
    One display model: its options menu, its preview, its name, its format, and its synchronization state.
    The `details` slot adds lines below the format. The default slot holds the actions of the host.
  -->
  <div v-auto-animate relative gap-2>
    <div absolute left-3 top-4 z-1>
      <DropdownMenuRoot>
        <DropdownMenuTrigger
          :class="[
            'bg-neutral-900/20 hover:bg-neutral-900/45 active:bg-neutral-900/60 dark:bg-neutral-950/50 hover:dark:bg-neutral-900/65 active:dark:bg-neutral-900/90',
          ]"
          text="white"
          h-7 w-7 flex items-center justify-center rounded-lg backdrop-blur-sm
          transition="colors duration-200 ease-in-out"
          aria-label="Options for Display Models"
        >
          <div i-solar:menu-dots-bold />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            :class="[
              'will-change-[opacity,transform] z-10000 max-w-45 rounded-lg p-0.5 text-white shadow-md outline-none data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade dark:text-black',
              'bg-neutral-900/30 dark:bg-neutral-950/50',
              'backdrop-blur-sm',
            ]"
            transition="colors duration-200 ease-in-out"
            align="start"
            side="bottom"
            :side-offset="4"
          >
            <DropdownMenuItem
              :class="[
                'relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-base leading-none outline-none data-[disabled]:pointer-events-none sm:text-sm',
                'data-[highlighted]:bg-red-900/20 dark:data-[highlighted]:bg-red-100/20',
                'text-white dark:text-white data-[highlighted]:text-red-200 dark:data-[highlighted]:text-red-200',
              ]"
              transition="colors duration-200 ease-in-out"
            >
              <button v-if="!model.cloudOnly" flex items-center gap-1 outline-none @click="handleRemoveModel(model)">
                <div i-solar:trash-bin-minimalistic-bold-duotone />
                <div>{{ t('settings.model-select.select-model.remove') }}</div>
              </button>
              <button v-else flex items-center gap-1 outline-none @click="displayModelStore.deleteCloudDisplayModel(model.id)">
                <div i-solar:cloud-cross-bold-duotone />
                <div>{{ t('settings.model-select.select-model.sync.delete-cloud') }}</div>
              </button>
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="syncStatuses[model.id] === 'local-only' || syncStatuses[model.id] === 'failed'"
              :class="[
                'relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-base leading-none outline-none data-[disabled]:pointer-events-none sm:text-sm',
                'data-[highlighted]:bg-neutral-100/20',
                'text-white dark:text-white',
              ]"
              transition="colors duration-200 ease-in-out"
            >
              <button flex items-center gap-1 outline-none @click="displayModelStore.uploadDisplayModel(model.id)">
                <div i-solar:cloud-upload-bold-duotone />
                <div>{{ t('settings.model-select.select-model.sync.upload') }}</div>
              </button>
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="syncStatuses[model.id] === 'synced' && !model.cloudOnly"
              :class="[
                'relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-base leading-none outline-none data-[disabled]:pointer-events-none sm:text-sm',
                'data-[highlighted]:bg-red-900/20 dark:data-[highlighted]:bg-red-100/20',
                'text-white dark:text-white data-[highlighted]:text-red-200 dark:data-[highlighted]:text-red-200',
              ]"
              transition="colors duration-200 ease-in-out"
            >
              <button flex items-center gap-1 outline-none @click="displayModelStore.deleteCloudDisplayModel(model.id)">
                <div i-solar:cloud-cross-bold-duotone />
                <div>{{ t('settings.model-select.select-model.sync.delete-cloud') }}</div>
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
    <!-- Generated previews have other shapes, for example 9:16 for VRM. The zero minimum height keeps every preview at 12:16. -->
    <div
      :class="[props.previewClass, 'min-h-0']"
      aspect="12/16"
      px-1 py-2
    >
      <img
        v-if="model.previewImage"
        :src="model.previewImage"
        draggable="false"
        :class="[
          'h-full w-full rounded-xl object-cover',
          'transition-all duration-200 ease-in-out',
          props.highlighted ? 'ring-3 ring-primary-400' : 'ring-0 ring-transparent',
        ]"
      >
      <div
        v-else-if="model.cloudOnly"
        :class="[
          'h-full w-full flex flex-col items-center justify-center gap-2 rounded-xl',
          'bg-neutral-100 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-600',
          'transition-all duration-200 ease-in-out',
          syncStatuses[model.id] === 'downloading' ? 'animate-pulse motion-reduce:animate-none' : '',
          props.highlighted ? 'ring-3 ring-primary-400' : 'ring-0 ring-transparent',
        ]"
      >
        <div :class="[syncStatuses[model.id] === 'downloading' ? 'i-solar:cloud-download-bold-duotone' : 'i-solar:cloud-bold-duotone', 'text-4xl opacity-75']" />
      </div>
      <div v-else bg="neutral-100 dark:neutral-900" relative h-full w-full flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl :class="[props.highlighted ? 'ring-3 ring-primary-400' : 'ring-0 ring-transparent']" transition="all duration-200 ease-in-out">
        <div i-solar:question-square-bold-duotone text-4xl opacity-75 />
        <div translate-y="100%" absolute top-0 flex flex-col translate-x--7 rotate-45 scale-250 gap-0 opacity-5>
          <div text="sm sm:sm" translate-x-7 translate-y--2 text-nowrap>
            unavailable Preview unavailable Preview
          </div>
          <div text="sm sm:sm" translate-x-0 translate-y--0 text-nowrap>
            Preview unavailable Preview unavailable
          </div>
          <div text="sm sm:sm" translate-x--7 translate-y-2 text-nowrap>
            unavailable Preview unavailable Preview
          </div>
        </div>
      </div>
    </div>
    <div w-full flex flex-col>
      <div w-full flex-1 px-2 py-4>
        <EditableRoot
          v-slot="{ isEditing }"
          :default-value="model.name"
          placeholder="Model Name..."
          class="flex gap-2"
          auto-resize
        >
          <EditableArea class="w-[calc(100%-8px-1rem)] dark:text-white">
            <EditablePreview class="line-clamp-1 w-[calc(100%-8px)] overflow-hidden text-ellipsis" />
            <EditableInput class="w-[calc(100%-8px)]! placeholder:text-neutral-700 dark:placeholder:text-neutral-600" />
          </EditableArea>
          <EditableEditTrigger v-if="!isEditing">
            <div i-solar:pen-2-line-duotone opacity-50 />
          </EditableEditTrigger>
          <div v-else class="flex gap-2">
            <EditableSubmitTrigger>
              <div i-solar:check-read-line-duotone opacity-50 />
            </EditableSubmitTrigger>
          </div>
        </EditableRoot>
        <div flex items-center gap-1 text="neutral-400 dark:neutral-600">
          <div i-solar:tag-horizontal-bold />
          <div>{{ mapFormatRenderer[model.format] }}</div>
        </div>
        <slot name="details" />
        <div v-if="syncStatuses[model.id]" flex items-center gap-1 text="xs neutral-400 dark:neutral-600">
          <div i-solar:cloud-bold />
          <div v-if="syncStatuses[model.id] === 'uploading' && uploadProgress[model.id] !== undefined">
            {{ t('settings.model-select.select-model.sync.upload-progress', { percent: uploadProgress[model.id] }) }}
          </div>
          <div v-else>
            {{ t(`settings.model-select.select-model.sync.status.${syncStatuses[model.id]}`) }}
          </div>
        </div>
        <Progress
          v-if="syncStatuses[model.id] === 'uploading' && uploadProgress[model.id] !== undefined"
          :progress="uploadProgress[model.id]"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="uploadProgress[model.id]"
          :aria-label="t('settings.model-select.select-model.sync.status.uploading')"
          class="mt-1"
        />
        <div v-if="syncErrors[model.id]" text="xs red-500" class="line-clamp-2">
          {{ syncErrors[model.id] }}
        </div>
      </div>
      <slot />
    </div>
  </div>
</template>
