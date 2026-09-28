<script setup lang="ts">
import SettingsGeneralFields from '@proj-airi/stage-pages/components/settings-general-fields.vue'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { FieldCheckbox } from '@proj-airi/ui'
import { onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { electron, electronAppIconGet, electronAppIconSet } from '../../../../shared/eventa'

const { t } = useI18n()
const getHidden = useElectronEventaInvoke(electronAppIconGet)
const setHidden = useElectronEventaInvoke(electronAppIconSet)
const getIsMacOS = useElectronEventaInvoke(electron.app.isMacOS)
const getIsWindows = useElectronEventaInvoke(electron.app.isWindows)
const hideAppIcon = shallowRef(false)
const ready = shallowRef(false)
const saving = shallowRef(false)
const supported = shallowRef(false)

onMounted(async () => {
  try {
    const [isMacOS, isWindows] = await Promise.all([getIsMacOS(), getIsWindows()])
    supported.value = isMacOS || isWindows
    if (!supported.value)
      return

    hideAppIcon.value = await getHidden()
    ready.value = true
  }
  catch {
    toast.error(t('tamagotchi.settings.pages.system.general.hide-app-icon.load-error'))
  }
})

async function updateHidden(hidden: boolean) {
  saving.value = true
  try {
    hideAppIcon.value = await setHidden(hidden)
  }
  catch {
    toast.error(t('tamagotchi.settings.pages.system.general.hide-app-icon.save-error'))
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <SettingsGeneralFields>
    <template #additional-fields>
      <FieldCheckbox
        v-if="supported"
        :model-value="hideAppIcon"
        :disabled="!ready || saving"
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
