<script setup lang="ts">
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const artistryStore = useArtistryStore()

const {
  comfyuiWslBackendPath,
  comfyuiWslNodePath,
  comfyuiHostUrl,
  comfyuiDefaultCheckpoint,
  comfyuiDefaultRemixId,
} = storeToRefs(artistryStore)
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
        ComfyUI Configuration
      </h2>
      <div class="text-neutral-400 dark:text-neutral-500">
        Configure your local ComfyUI WSL backend connection.
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <FieldInput
        v-model="comfyuiWslBackendPath"
        label="WSL Backend Path"
        description="Absolute path to the CUIPP backend in WSL"
        placeholder="/mnt/e/CUIPP/comfyGalleryAppBackend"
      />

      <FieldInput
        v-model="comfyuiWslNodePath"
        label="WSL Node Path"
        description="Path to the Node.js executable in WSL"
        placeholder="/home/user/.nvm/versions/node/v22.22.0/bin/node"
      />

      <FieldInput
        v-model="comfyuiHostUrl"
        label="Host URL"
        description="Public URL or local address serving generated images"
        placeholder="https://comfyui-plus.duckdns.org"
      />

      <FieldInput
        v-model="comfyuiDefaultCheckpoint"
        label="Default Checkpoint"
        description="Fallback model to use if not specified by the character card"
        placeholder="bunnyMint_bunnyMint.safetensors"
      />

      <FieldInput
        v-model="comfyuiDefaultRemixId"
        label="Global Default Remix ID"
        description="Global fallback remix ID if the card has no target specified"
        placeholder="48250602"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.provider.comfyui.settings.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
