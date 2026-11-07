<script setup lang="ts">
import type { SessionFeatureOverrides } from '@proj-airi/core-agent'

import { errorMessageFrom } from '@moeru/std'
import { Alert, GhostButton } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionFeatureField from './session-feature-field.vue'

import { useProviderGenerationSettings } from '../../../../composables/use-provider-generation-settings'
import { useSessionFeatureAvailability } from '../../../../composables/use-session-feature-availability'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { SESSION_FEATURE_GROUPS, sessionFeatureChange, sessionFeatureValue } from '../session-feature-groups'

const props = defineProps<{ sessionId: string }>()
const { t } = useI18n()
const sessions = useChatSessionStore()
const cards = useAiriCardStore()
const generation = useProviderGenerationSettings(() => {
  const characterId = sessions.sessionMetas[props.sessionId]?.characterId
  return characterId && cards.ready && cards.cards.has(characterId) ? cards.getModules(characterId).consciousness.provider : undefined
})
const availability = useSessionFeatureAvailability(() => generation.nativeWebSearch.value)
const saving = shallowRef(false)
const error = shallowRef<string>()
const features = computed(() => sessions.sessionFeatures[props.sessionId])
const overrides = computed(() => sessions.sessionMetas[props.sessionId]?.features)
const overrideCount = computed(() => overrides.value ? Object.keys(overrides.value).length : 0)
const visibleGroups = computed(() => {
  const explicitChoices = new Set<string>()
  if (overrides.value) {
    for (const key of Object.keys(overrides.value))
      explicitChoices.add(key)
    if (overrides.value.tools) {
      for (const group of Object.keys(overrides.value.tools))
        explicitChoices.add(`tools.${group}`)
    }
  }
  const meta = sessions.sessionMetas[props.sessionId]
  const parent = meta?.recipeId && meta.parentSessionId ? sessions.sessionFeatures[meta.parentSessionId] : undefined
  return SESSION_FEATURE_GROUPS.map(group => ({
    id: group.id,
    features: group.features.filter(key => availability.value[key].visible || explicitChoices.has(key)).map(key => ({
      key,
      blocker: parent && !sessionFeatureValue(parent, key)
        ? { reason: 'parent-restricted' as const }
        : availability.value[key].blocker,
    })),
  })).filter(group => group.features.length)
})

async function save(change?: SessionFeatureOverrides) {
  saving.value = true
  error.value = undefined
  try {
    if (!await sessions.setSessionFeatures(props.sessionId, change))
      throw new Error(t('settings.session-features.missing-session'))
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('settings.session-features.save-error')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-4']" :aria-busy="saving">
    <div :class="['flex items-center gap-3']">
      <slot name="title" />
      <GhostButton size="sm" :class="['ml-auto']" :disabled="saving || !overrideCount" @click="save()">
        <span aria-hidden="true" :class="['i-solar:restart-outline size-3.5']" />
        {{ t('settings.session-features.restore-all') }}
      </GhostButton>
      <slot name="close" />
    </div>
    <Alert v-if="error" tone="danger" live="assertive">
      {{ error }}
    </Alert>
    <template v-if="features">
      <section v-for="group in visibleGroups" :key="group.id" :aria-label="t(`settings.session-features.groups.${group.id}`)">
        <h3 :class="['mb-1 text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t(`settings.session-features.groups.${group.id}`) }}
        </h3>
        <SessionFeatureField
          v-for="field in group.features" :key="field.key"
          :feature="field.key" :value="sessionFeatureValue(features, field.key)"
          :blocker="field.blocker"
          :disabled="saving"
          @change="save(sessionFeatureChange(field.key, $event))"
        />
      </section>
    </template>
    <Alert v-else tone="warning">
      {{ t('settings.session-features.missing-session') }}
    </Alert>
    <span role="status" :class="['sr-only']">{{ saving ? t('settings.session-features.saving') : '' }}</span>
  </div>
</template>
