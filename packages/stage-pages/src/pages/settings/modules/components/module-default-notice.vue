<script setup lang="ts">
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  /** The module whose page shows this notice. The page edits the global default of this module. */
  module: 'consciousness' | 'vision' | 'speech'
}>()

const { t } = useI18n()
const { activeCard, activeCardId } = storeToRefs(useAiriCardStore())

/**
 * Whether the active character has a value of its own for this module.
 * Such a character does not follow the default, so a selection on this page does not change its replies.
 */
const characterHasOwnValue = computed(() => {
  const modules = activeCard.value?.extensions.airi.modules
  if (!modules)
    return false
  if (props.module === 'speech')
    return !!modules.speech.provider || !!modules.speech.model || !!modules.speech.voice_id

  return !!modules[props.module].provider || !!modules[props.module].model
})

/** The module selections of the active character, in its editor. */
const characterEditor = computed(() => ({
  path: `/settings/airi-card/${encodeURIComponent(activeCardId.value)}/edit`,
  query: { section: 'modules' },
}))
</script>

<template>
  <div :class="['flex flex-col gap-3']">
    <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.modules.default-notice.description') }}
    </p>
    <Callout v-if="characterHasOwnValue" theme="primary" data-testid="module-default-notice-own-value">
      <template #label>
        {{ t('settings.pages.modules.default-notice.own-value.title', { name: activeCard?.name }) }}
      </template>
      <div :class="['flex flex-col gap-2', 'text-sm']">
        <p>{{ t('settings.pages.modules.default-notice.own-value.description', { name: activeCard?.name }) }}</p>
        <RouterLink
          :to="characterEditor"
          :class="[
            'w-fit',
            'text-primary-600 dark:text-primary-300',
            'underline underline-offset-2',
            'hover:text-primary-500 dark:hover:text-primary-200',
          ]"
        >
          {{ t('settings.pages.modules.default-notice.own-value.edit', { name: activeCard?.name }) }}
        </RouterLink>
      </div>
    </Callout>
  </div>
</template>
