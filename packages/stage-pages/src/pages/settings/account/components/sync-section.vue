<script setup lang="ts">
import { syncCategories, useSyncPreferencesStore } from '@proj-airi/stage-ui/stores/sync-preferences'
import { FieldCheckbox } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { syncItemKey, syncSearchKey } from '../index.search'

const { t } = useI18n()
const syncPreferences = useSyncPreferencesStore()

// The settings search of the build cannot read a key built in the template, so the keys come from the script.
// `index.search.ts` lists the same switches for the search.
const items = syncCategories.map(category => ({
  category,
  searchKey: syncSearchKey(category),
  titleKey: `${syncItemKey(category)}.title`,
  descriptionKey: `${syncItemKey(category)}.description`,
}))
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
        v-for="item in items"
        :key="item.category"
        :data-settings-search="item.searchKey"
        :class="['rounded-lg px-3 py-2', 'bg-neutral-100 dark:bg-neutral-900']"
      >
        <FieldCheckbox
          :model-value="syncPreferences.isEnabled(item.category)"
          :label="t(item.titleKey)"
          :description="t(item.descriptionKey)"
          @update:model-value="syncPreferences.setEnabled(item.category, $event)"
        />
      </li>
    </ul>

    <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.account.sync.off_note') }}
    </p>
  </div>
</template>
