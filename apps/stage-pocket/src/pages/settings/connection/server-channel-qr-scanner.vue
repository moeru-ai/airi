<script setup lang="ts">
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner'
import { errorMessageFrom } from '@moeru/std'
import { parseServerChannelQrPayload } from '@proj-airi/stage-shared/server-channel-qr'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { Button } from '@proj-airi/ui'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { probeServerChannelQrPayload } from '../../../modules/server-channel-qr-probe'

const { t } = useI18n()
const serverChannelStore = useModsServerChannelStore()

const scanning = shallowRef(false)
const errorMessage = shallowRef('')

async function scanServerChannelQrCode() {
  scanning.value = true
  errorMessage.value = ''

  try {
    const scanResult = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      scanInstructions: t('settings.pages.connection.qr-scan.instructions'),
    })
    const payload = parseServerChannelQrPayload(scanResult.ScanResult)
    const url = await probeServerChannelQrPayload(payload)

    serverChannelStore.websocketAuthToken = payload.authToken
    serverChannelStore.websocketUrl = url
    toast.success(t('settings.pages.connection.qr-scan.success.title'), {
      description: t('settings.pages.connection.qr-scan.success.description', { url }),
    })
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.connection.qr-scan.errors.failed')
    toast.error(t('settings.pages.connection.qr-scan.errors.title'), {
      description: errorMessage.value,
    })
  }
  finally {
    scanning.value = false
  }
}
</script>

<template>
  <div :class="['flex flex-col items-start justify-between gap-3']">
    <div :class="['flex flex-col gap-1']">
      <div :class="['text-sm font-medium text-neutral-900 dark:text-neutral-100']">
        {{ t('settings.pages.connection.qr-scan.title') }}
      </div>
      <p :class="['m-0 text-xs leading-5 text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.connection.qr-scan.description') }}
      </p>
    </div>
    <Button
      variant="secondary-muted"
      :loading="scanning"
      :label="t('settings.pages.connection.qr-scan.action')"
      @click="scanServerChannelQrCode"
    />
  </div>
</template>
