<script setup lang="ts">
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '../../Misc/Button.vue'

import { ToasterRootInjectionKey } from './constants'

const props = defineProps<{ id?: string }>()

const emits = defineEmits<{ (e: 'update'): void }>()

const { t } = useI18n()

const toastRoot = inject(ToasterRootInjectionKey, { close: (id: string) => console.warn('No toast root provided, cannot close toast', id) })

function handleUpdate() {
  emits('update')
  toastRoot.close(props.id || '')
}

function handleNotNow() {
  toastRoot.close(props.id || '')
}
</script>

<template>
  <div
    w-full flex flex-col gap-1 rounded-xl
  >
    <div mb-1 text-nowrap>
      {{ t('base.toaster.pwaUpdateReady.message') }}
    </div>
    <div w-full flex items-center gap-2>
      <Button w-full size="sm" variant="secondary" @click="() => handleNotNow()">
        <div i-solar:close-circle-line-duotone />
        <div text-nowrap>
          {{ t('base.toaster.pwaUpdateReady.action.notNow') }}
        </div>
      </Button>
      <Button w-full size="sm" @click="() => handleUpdate()">
        <div i-solar:check-circle-line-duotone />
        <div text-nowrap>
          {{ t('base.toaster.pwaUpdateReady.action.ok') }}
        </div>
      </Button>
    </div>
  </div>
</template>
