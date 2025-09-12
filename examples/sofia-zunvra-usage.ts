// Ejemplo de implementación práctica usando Sofia Zunvra API en Airix
// Este archivo demuestra cómo migrar de tu función original a usar el proveedor de Airix

import { useLLM } from '@proj-airi/stage-ui/stores/llm'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'

// Función original que proporcionaste (como referencia)
async function _sendMessageOriginal() {
  const userMessage = document.getElementById('userMessage').value
  const temperature = Number.parseFloat(document.getElementById('temperature').value)
  const maxTokens = Number.parseInt(document.getElementById('maxTokens').value)
  const systemPrompt = document.getElementById('systemPrompt').value

  try {
    const response = await fetch('https://sofia.zunvra.com/api/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      },
      body: JSON.stringify({
        model: 'llama3.2:latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    })

    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || 'No content received in the response.'
    console.warn(content)
  }
  catch (error) {
    console.error(`Error communicating with the API: ${error.message}`)
  }
}

// Nueva implementación usando el sistema de proveedores de Airix
export async function sendMessageWithAirix(
  userMessage: string,
  systemPrompt: string = 'Eres un asistente útil.',
  temperature: number = 0.7,
  maxTokens: number = 1000,
  model: string = 'llama3.2:latest',
) {
  const providersStore = useProvidersStore()
  const llm = useLLM()

  try {
    // Verificar que el proveedor esté configurado
    if (!providersStore.configuredProviders['sofia-zunvra']) {
      throw new Error('Sofia Zunvra provider is not configured. Please add your API key in settings.')
    }

    // Obtener la instancia del proveedor configurado
    const provider = await providersStore.getProviderInstance('sofia-zunvra')

    if (!provider) {
      throw new Error('Failed to initialize Sofia Zunvra provider')
    }

    // Preparar los mensajes
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]

    // Usar el stream de LLM con las opciones especificadas
    const stream = llm.stream(model, provider, messages, {
      temperature,
      maxTokens,
      // El sistema maneja automáticamente la API key y headers
    })

    // Procesar la respuesta en streaming
    let fullContent = ''

    for await (const chunk of stream) {
      if (chunk.content) {
        fullContent += chunk.content
        // Aquí puedes actualizar la UI en tiempo real
        console.warn('Chunk:', chunk.content)
      }
    }

    console.warn('Full response:', fullContent)
    return fullContent
  }
  catch (error) {
    console.error('Error communicating with Sofia Zunvra API:', error.message)
    throw error
  }
}

// Función para usar en componentes Vue
export function useSofiaZunvraChat() {
  const providersStore = useProvidersStore()
  const llm = useLLM()

  const sendMessage = async (options: {
    userMessage: string
    systemPrompt?: string
    temperature?: number
    maxTokens?: number
    model?: string
    onChunk?: (content: string) => void
  }) => {
    const {
      userMessage,
      systemPrompt = 'Eres un asistente útil.',
      temperature = 0.7,
      maxTokens = 1000,
      model = 'llama3.2:latest',
      onChunk,
    } = options

    if (!providersStore.configuredProviders['sofia-zunvra']) {
      throw new Error('Sofia Zunvra provider is not configured')
    }

    const provider = await providersStore.getProviderInstance('sofia-zunvra')

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]

    const stream = llm.stream(model, provider, messages, {
      temperature,
      maxTokens,
    })

    let fullContent = ''

    for await (const chunk of stream) {
      if (chunk.content) {
        fullContent += chunk.content
        onChunk?.(chunk.content)
      }
    }

    return fullContent
  }

  return {
    sendMessage,
    isConfigured: () => providersStore.configuredProviders['sofia-zunvra'],
  }
}

// Ejemplo de uso en un componente Vue
/*
<script setup lang="ts">
import { ref } from 'vue'
import { useSofiaZunvraChat } from './sofia-zunvra-helper'

const userMessage = ref('')
const systemPrompt = ref('Eres un asistente útil.')
const temperature = ref(0.7)
const maxTokens = ref(1000)
const response = ref('')
const loading = ref(false)

const { sendMessage, isConfigured } = useSofiaZunvraChat()

async function handleSendMessage() {
    if (!isConfigured()) {
        alert('Please configure Sofia Zunvra provider in settings first')
        return
    }

    loading.value = true
    response.value = ''

    try {
        await sendMessage({
            userMessage: userMessage.value,
            systemPrompt: systemPrompt.value,
            temperature: temperature.value,
            maxTokens: maxTokens.value,
            onChunk: (chunk) => {
                response.value += chunk
            }
        })
    } catch (error) {
        console.error('Error:', error)
        alert('Error: ' + error.message)
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <div>
        <textarea v-model="systemPrompt" placeholder="System prompt"></textarea>
        <textarea v-model="userMessage" placeholder="Your message"></textarea>
        <input v-model.number="temperature" type="number" step="0.1" min="0" max="2">
        <input v-model.number="maxTokens" type="number" min="1">
        <button @click="handleSendMessage" :disabled="loading">
            {{ loading ? 'Sending...' : 'Send Message' }}
        </button>
        <div>{{ response }}</div>
    </div>
</template>
*/
