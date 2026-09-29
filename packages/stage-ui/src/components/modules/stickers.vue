<script setup lang="ts">
import { FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { chatStickers } from '../../assets/stickers'
import { useStickersStore } from '../../stores/modules/stickers'

const { t } = useI18n()
const { enabled } = storeToRefs(useStickersStore())
</script>

<template>
  <div :class="['flex flex-col gap-4', 'rounded-xl bg-neutral-100 p-4 dark:bg-neutral-900']">
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.stickers.enable')"
      :description="t('settings.pages.modules.stickers.enable-description')"
    />
    <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
      {{ t('settings.pages.modules.stickers.local-only') }}
    </p>
    <ul :aria-label="t('settings.pages.modules.stickers.catalog')" :class="['grid grid-cols-2 gap-4 sm:grid-cols-4']">
      <li v-for="sticker in chatStickers" :key="sticker.id" :class="['flex flex-col items-center gap-2']">
        <img :src="sticker.src" :alt="t(`settings.pages.modules.stickers.artwork.${sticker.id}`)" width="96" height="96" :class="['size-24 object-contain']">
        <span :class="['text-sm']">{{ t(`settings.pages.modules.stickers.artwork.${sticker.id}`) }}</span>
      </li>
    </ul>
  </div>
</template>
