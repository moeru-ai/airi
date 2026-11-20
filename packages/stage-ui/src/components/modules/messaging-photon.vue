<script setup lang="ts">
import { Alert, Button, FieldCheckbox, FieldInput, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { usePhotonStore } from '../../stores/modules/photon'

const { t } = useI18n()
const photonStore = usePhotonStore()
const { enabled, projectId, apiKey, configured } = storeToRefs(photonStore)
</script>

<template>
  <SettingsCard>
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.messaging-photon.enable')"
      :description="t('settings.pages.modules.messaging-photon.enable-description')"
    />

    <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
      <i18n-t keypath="settings.pages.modules.messaging-photon.powered-by" scope="global">
        <template #link>
          <a
            href="https://app.beta.photon.codes"
            target="_blank"
            rel="noopener noreferrer"
            :class="['underline', 'hover:text-primary-500']"
          >app.beta.photon.codes</a>
        </template>
      </i18n-t>
    </p>

    <FieldInput
      v-model="projectId"
      :label="t('settings.pages.modules.messaging-photon.project-id')"
      :description="t('settings.pages.modules.messaging-photon.project-id-description')"
      :placeholder="t('settings.pages.modules.messaging-photon.project-id-placeholder')"
    />

    <FieldInput
      v-model="apiKey"
      type="password"
      :label="t('settings.pages.modules.messaging-photon.api-key')"
      :description="t('settings.pages.modules.messaging-photon.api-key-description')"
      :placeholder="t('settings.pages.modules.messaging-photon.api-key-placeholder')"
    />

    <div>
      <Button
        :label="t('settings.common.save')"
        @click="photonStore.saveSettings()"
      />
    </div>

    <Alert v-if="configured" tone="success" :class="['mt-4']">
      {{ t('settings.pages.modules.messaging-photon.configured') }}
    </Alert>
  </SettingsCard>
</template>
