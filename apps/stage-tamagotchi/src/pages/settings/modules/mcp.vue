<script setup lang="ts">
import type { Tool } from '@proj-airi/tauri-plugin-mcp'

import { useMcpStore } from '@proj-airi/stage-ui/stores/mcp'
import { connectServer, disconnectServer, listTools } from '@proj-airi/tauri-plugin-mcp'
import {
  FieldInput,
} from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

const mcpStore = useMcpStore()
const connecting = ref(false)

const {
  serverCmd,
  serverArgs,
  connected,
} = storeToRefs(mcpStore)

const tools = ref<Tool[]>([])

async function connect() {
  connecting.value = true
  try {
    await connectServer(serverCmd.value, serverArgs.value.split(' '))
    connected.value = true
  }
  catch (e) {
    const error = e as string
    console.error(error)
    if (error.includes('already connected')) {
      connected.value = true
    }
  }
  finally {
    connecting.value = false
  }
}

async function disconnect() {
  await disconnectServer()
  connected.value = false
  tools.value = []
}

async function getTools() {
  tools.value = await listTools()
}
</script>

<template>
  <div flex="~ col md:row gap-6">
    <div flex="~ col gap-6" class="w-full md:w-[60%]">
      <div w-full rounded-xl>
        <div flex="~ col gap-4">
          <FieldInput
            v-model="serverCmd"
            type="text"
            label="Server Command"
            description="Enter the server command to run"
            placeholder="docker"
            :disabled="connecting || connected"
          />

          <FieldInput
            v-model="serverArgs"
            type="text"
            label="Server Arguments"
            description="Enter the server command arguments"
            placeholder="run -i --rm -e ADB_HOST=host.docker.internal ghcr.io/lemonnekogh/airi-android:v0.1.0"
            :disabled="connecting || connected"
          />

          <div flex="~ row" gap-4>
            <button
              v-if="!connected"
              border="neutral-800 dark:neutral-200 solid 2" transition="border duration-250 ease-in-out"
              rounded-lg px-4 text="neutral-100 dark:neutral-900" py-2 text-sm
              :disabled="connecting || !serverCmd || !serverArgs"
              :class="{ 'opacity-50 cursor-not-allowed': connecting || !serverCmd || !serverArgs }"
              bg="neutral-700 dark:neutral-300" @click="connect"
            >
              <div flex="~ row" items-center gap-2>
                <div i-solar:play-circle-bold-duotone />
                <span>Connect</span>
              </div>
            </button>
            <button
              v-else border="primary-300 dark:primary-800 solid 2"
              transition="border duration-250 ease-in-out" rounded-lg px-4 py-2 text-sm @click="disconnect"
            >
              <div flex="~ row" items-center gap-2>
                <div i-solar:stop-circle-bold-duotone />
                <span>Disconnect</span>
              </div>
            </button>
            <button
              v-if="connected"
              border="neutral-800 dark:neutral-200 solid 2" transition="border duration-250 ease-in-out"
              rounded-lg px-4 text="neutral-100 dark:neutral-900" py-2 text-sm
              :disabled="connecting"
              :class="{ 'opacity-50 cursor-not-allowed': connecting }"
              bg="neutral-700 dark:neutral-300" @click="getTools"
            >
              <div flex="~ row" items-center gap-2>
                <div solar:list-arrow-down-line-duotone />
                <span>List Tools</span>
              </div>
            </button>
          </div>

          <div v-if="tools.length > 0" flex="~ col gap-4">
            <div v-for="tool in tools" :key="tool.name" border="neutral-200 dark:neutral-800 solid 2" rounded-lg p-4>
              <div text="neutral-900 dark:neutral-100" text-sm>
                {{ tool.name }}
              </div>
              <div text="neutral-500 dark:neutral-400" text-xs>
                {{ tool.description }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:user-speak-rounded-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
