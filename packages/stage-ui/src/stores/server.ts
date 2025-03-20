import { Client } from '@proj-airi/server-sdk'
import { defineStore } from 'pinia'
import { onMounted, ref } from 'vue'

export const useServerStore = defineStore('server', () => {
  const server = ref<Client>()

  onMounted(() => {
    server.value = new Client({
      name: 'stage-web',
      autoConnect: false,
      autoReconnect: true,
      onError: (error) => {
        console.error(error)
      },
    })
  })

  function connect() {
    server.value?.connect()
  }

  return {
    server,
    connect,
  }
})
