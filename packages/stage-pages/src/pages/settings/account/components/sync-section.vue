<script setup lang="ts">
import { syncCategories, useSyncPreferencesStore } from '@proj-airi/stage-ui/stores/sync-preferences'
import { FieldCheckbox } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { syncItemKey, syncSearchKey } from '../index.search'

const { t } = useI18n()
const syncPreferences = useSyncPreferencesStore()
</script>

<template>
  <div :class="['flex flex-col gap-4']">
    <header :class="['flex flex-col gap-1']">
      <h3 :class="['text-lg font-semibold']">
        {{ t('settings.pages.account.sync.title') }}
      </h3>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.account.sync.description') }}
      </p>
    </header>

    <ul :class="['flex flex-col gap-2 max-w-unset md:max-w-md']">
      <li
        v-for="category in syncCategories"
        :key="category"
        :data-settings-search="syncSearchKey(category)"
        :class="['rounded-lg px-3 py-2', 'bg-neutral-100 dark:bg-neutral-900']"
      >
        <FieldCheckbox
          :model-value="syncPreferences.isEnabled(category)"
          :label="t(`${syncItemKey(category)}.title`)"
          :description="t(`${syncItemKey(category)}.description`)"
          @update:model-value="syncPreferences.setEnabled(category, $event)"
        />
      </li>
    </ul>

    <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.account.sync.off_note') }}
    </p>
  </div>
</template>
