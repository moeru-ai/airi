<script setup lang="ts">
import { electronGetServerChannelQrPayload } from '@proj-airi/tauri-eventa'
import { useElectronEventaInvoke } from '@proj-airi/tauri-vueuse'
import { onMounted } from 'vue'

import { createServerChannelQrPayloadController } from '../settings-connection'

const getServerChannelQrPayload = useElectronEventaInvoke(electronGetServerChannelQrPayload)
const { loading, errorMessage, candidateUrls, qrCodeSource, refreshPayload } =
  createServerChannelQrPayloadController(getServerChannelQrPayload)

onMounted(() => {
  void refreshPayload()
})
</script>

<template>
  <section class="server-channel-qr-card" aria-label="Server channel QR">
    <div class="qr-card-header">
      <div>
        <p class="eyebrow">Connection</p>
        <h2>Server channel QR</h2>
        <p class="qr-card-description">Scan from another AIRI client on this network.</p>
      </div>
      <button class="qr-refresh-button" type="button" :disabled="loading" @click="refreshPayload">
        {{ loading ? 'Refreshing' : 'Refresh' }}
      </button>
    </div>

    <p v-if="errorMessage" class="qr-error">
      {{ errorMessage }}
    </p>

    <div v-else-if="qrCodeSource" class="qr-content">
      <img class="qr-image" :src="qrCodeSource" alt="Server channel QR code" />
      <div class="qr-details">
        <p class="panel-title">Candidate URL</p>
        <ul class="qr-url-list" aria-label="Server channel candidate URLs">
          <li v-for="url in candidateUrls" :key="url">
            {{ url }}
          </li>
        </ul>
      </div>
    </div>

    <p v-else class="panel-text">Channel server QR is not available yet.</p>
  </section>
</template>
