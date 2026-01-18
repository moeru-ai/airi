<script setup lang="ts">
import { connectServer, disconnectServer } from '@proj-airi/tauri-plugin-mcp'
import { Button, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMcpStore } from '../../stores/mcp'

const { t } = useI18n()
const mcpStore = useMcpStore()
const { serverCmd, serverArgs, connected } = storeToRefs(mcpStore)

const serverArgsString = ref(serverArgs.value || '')
const isConnecting = ref(false)
const error = ref<string | null>(null)

const configured = computed(() => connected.value && serverCmd.value)

async function handleConnect() {
  if (!serverCmd.value) {
    error.value = t('settings.pages.modules.mcp-server.command-required')
    return
  }

  isConnecting.value = true
  error.value = null

  try {
    const args = serverArgsString.value.trim() ? serverArgsString.value.trim().split(/\s+/) : []
    await connectServer(serverCmd.value, args)
    connected.value = true
    serverArgs.value = serverArgsString.value
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    connected.value = false
  }
  finally {
    isConnecting.value = false
  }
}

async function handleDisconnect() {
  isConnecting.value = true
  error.value = null

  try {
    await disconnectServer()
    connected.value = false
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
  finally {
    isConnecting.value = false
  }
}

// Initialize args string from store
if (serverArgs.value) {
  serverArgsString.value = serverArgs.value
}
</script>

<template>
  <div flex="~ col gap-6">
    <FieldInput
      v-model="serverCmd"
      :label="t('settings.pages.modules.mcp-server.command')"
      :description="t('settings.pages.modules.mcp-server.command-description')"
      :placeholder="t('settings.pages.modules.mcp-server.command-placeholder')"
      :disabled="connected"
    />

    <FieldInput
      v-model="serverArgsString"
      :label="t('settings.pages.modules.mcp-server.args')"
      :description="t('settings.pages.modules.mcp-server.args-description')"
      :placeholder="t('settings.pages.modules.mcp-server.args-placeholder')"
      :disabled="connected"
    />

    <div flex="~ gap-2">
      <Button
        v-if="!connected"
        :label="t('settings.pages.modules.mcp-server.connect')"
        variant="primary"
        :disabled="isConnecting || !serverCmd"
        @click="handleConnect"
      />
      <Button
        v-else
        :label="t('settings.pages.modules.mcp-server.disconnect')"
        variant="secondary"
        :disabled="isConnecting"
        @click="handleDisconnect"
      />
    </div>

    <div v-if="error" class="rounded-lg bg-red-100 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-400">
      {{ error }}
    </div>

    <div v-if="configured && !error" class="rounded-lg bg-green-100 p-4 text-green-800 dark:bg-green-900/20 dark:text-green-400">
      {{ t('settings.pages.modules.mcp-server.connected') }}
    </div>
  </div>
</template>
