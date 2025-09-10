import type { RemovableRef } from '@vueuse/core' // fixed import

// ...

onMounted(async () => {
  providersStore.initializeProvider(providerId)
  baseUrl.value = providers.value[providerId]?.baseUrl || ''

  try {
    const url = baseUrl.value.endsWith('/')
      ? `${baseUrl.value}health`
      : `${baseUrl.value}/health`

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'player2-game-key': 'airi',
      },
    })

    hasPlayer2.value = res.status === 200
  }
  catch (e) {
    console.error(e)
    hasPlayer2.value = false
  }
})

watch(baseUrl, () => { // simplified watch
  providers.value[providerId] = {
    ...providers.value[providerId],
    baseUrl: baseUrl.value || '',
  }
})

function handleResetSettings() {
  const defaults = typeof providerMetadata.value?.defaultOptions === 'function'
    ? providerMetadata.value?.defaultOptions()
    : providerMetadata.value?.defaultOptions || {}
  providers.value[providerId] = { ...defaults }
}
