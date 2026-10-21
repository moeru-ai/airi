<script setup lang="ts">
import type { NetworkProxyConfig, NetworkProxyState } from '../../../shared/eventa/network-proxy'

import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { Button, FieldInput, FieldSelect } from '@proj-airi/ui'
import { safeParse } from 'valibot'
import { computed, onMounted, onScopeDispose, reactive, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { networkProxyChanged, networkProxyConfigSchema, networkProxyGet, networkProxySet } from '../../../shared/eventa/network-proxy'

const { t } = useI18n()
const get = useElectronEventaInvoke(networkProxyGet)
const set = useElectronEventaInvoke(networkProxySet)
const draft = reactive<NetworkProxyConfig>({ mode: 'system', address: '', bypassRules: '' })
const applied = shallowRef<NetworkProxyConfig>()
const available = shallowRef(false)
const saving = shallowRef(false)
const message = shallowRef('')
const dirty = computed(() => JSON.stringify(draft) !== JSON.stringify(applied.value))
const modes = computed(() => ['system', 'direct', 'custom'].map(value => ({ value, label: t(`tamagotchi.settings.pages.system.general.network-proxy.${value}`) })))
let updated = false
let disposed = false

function apply(state: NetworkProxyState) {
  if (!applied.value || !dirty.value)
    Object.assign(draft, state.config)
  applied.value = state.config
  available.value = state.available
}

const context = getElectronEventaContext()
const listener = context.on(networkProxyChanged, ({ body }) => {
  if (!body)
    return
  updated = true
  apply(body)
})
onScopeDispose(() => {
  disposed = true
  listener()
})
onMounted(async () => {
  try {
    const state = await get(undefined, { signal: AbortSignal.timeout(5000) })
    if (!disposed && !updated)
      apply(state)
  }
  catch {
    message.value = 'load-error'
  }
})

async function save() {
  const input = { ...draft, address: draft.address.trim(), bypassRules: draft.bypassRules.trim() }
  if (!safeParse(networkProxyConfigSchema, input).success) {
    message.value = 'invalid-address'
    return
  }
  saving.value = true
  message.value = ''
  try {
    const state = await set(input)
    Object.assign(draft, state.config)
    apply(state)
    message.value = 'saved'
  }
  catch {
    message.value = 'save-error'
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <section :class="['flex flex-col gap-4']">
    <FieldSelect
      v-model="draft.mode"
      :label="t('tamagotchi.settings.pages.system.general.network-proxy.title')"
      :description="t('tamagotchi.settings.pages.system.general.network-proxy.description')"
      :options="modes"
      :disabled="!applied || saving"
    />
    <template v-if="draft.mode === 'custom'">
      <FieldInput
        v-model="draft.address"
        :label="t('tamagotchi.settings.pages.system.general.network-proxy.address')"
        placeholder="http://127.0.0.1:7890"
        :description="t('tamagotchi.settings.pages.system.general.network-proxy.address-description')"
        :disabled="saving"
      />
      <FieldInput
        v-model="draft.bypassRules"
        :label="t('tamagotchi.settings.pages.system.general.network-proxy.bypass')"
        :description="t('tamagotchi.settings.pages.system.general.network-proxy.bypass-description')"
        :disabled="saving"
      />
    </template>
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.pages.system.general.network-proxy.connections') }}
    </p>
    <Button
      :label="t('tamagotchi.settings.pages.system.general.network-proxy.save')"
      :disabled="!applied || saving || (!dirty && available)"
      @click="save"
    />
    <p v-if="message || !available" role="status">
      {{ t(`tamagotchi.settings.pages.system.general.network-proxy.${message || 'unavailable'}`) }}
    </p>
  </section>
</template>
