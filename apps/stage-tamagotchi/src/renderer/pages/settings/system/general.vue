<script setup lang="ts">
import SettingsGeneralFields from '@proj-airi/stage-pages/components/settings-general-fields.vue'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { FieldCheckbox } from '@proj-airi/ui'
import { onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import NetworkProxySettings from '../../../components/settings/network-proxy-settings.vue'

import { electron, electronAppIconGet, electronAppIconSet } from '../../../../shared/eventa'
import { aiProxyAvailable, aiProxyEnabled, setAIProxyEnabled } from '../../../modules/ai-transport'

const { t } = useI18n()
const getHidden = useElectronEventaInvoke(electronAppIconGet)
const setHidden = useElectronEventaInvoke(electronAppIconSet)
const isLinux = useElectronEventaInvoke(electron.app.isLinux)
// The value stays undefined on Linux, and the field does not show there.
const hideAppIcon = shallowRef<boolean>()

onMounted(async () => {
  try {
    if (!await isLinux())
      hideAppIcon.value = await getHidden()
  }
  catch {
    toast.error(t('tamagotchi.settings.pages.system.general.hide-app-icon.load-error'))
  }
})

async function updateHidden(hidden: boolean) {
  try {
    hideAppIcon.value = await setHidden(hidden)
  }
  catch {
    toast.error(t('tamagotchi.settings.pages.system.general.hide-app-icon.save-error'))
  }
}
async function updateAIProxy(enabled: boolean) {
  try {
    await setAIProxyEnabled(enabled)
  }
  catch {
    toast.error(t('tamagotchi.settings.pages.system.general.ai-proxy.save-error'))
  }
}
</script>

<template>
  <SettingsGeneralFields>
    <template #additional-fields>
      <NetworkProxySettings />
      <FieldCheckbox
        :model-value="aiProxyEnabled"
        :label="t('tamagotchi.settings.pages.system.general.ai-proxy.title')"
        :description="t('tamagotchi.settings.pages.system.general.ai-proxy.description')"
        @update:model-value="updateAIProxy"
      />
      <p role="status">
        {{ t(`tamagotchi.settings.pages.system.general.ai-proxy.${!aiProxyAvailable ? 'unavailable' : aiProxyEnabled ? 'enabled' : 'disabled'}`) }}
      </p>
      <FieldCheckbox
        v-if="hideAppIcon !== undefined"
        :model-value="hideAppIcon"
        :label="t('tamagotchi.settings.pages.system.general.hide-app-icon.title')"
        :description="t('tamagotchi.settings.pages.system.general.hide-app-icon.description')"
        @update:model-value="updateHidden"
      />
    </template>
  </SettingsGeneralFields>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.general.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
