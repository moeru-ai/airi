<script setup lang="ts">
import { Collapsable } from '@proj-airi/stage-ui/components'
import { toJsonSchema } from '@valibot/to-json-schema'
import { description, object, optional, pipe, record, string, title } from 'valibot'
import { computed, ref } from 'vue'

interface ModelProvider {
  id: string
  name: string
  icon?: string
  fields: ReturnType<typeof toJsonSchema>
}

const providers = computed<ModelProvider[]>(() => [
  {
    id: 'openrouter-ai',
    name: 'OpenRouter',
    icon: 'i-lobe-icons:openrouter',
    fields: toJsonSchema(
      object({
        apiKey: pipe(string(), title('API Key'), description('API Key for OpenRouter')),
        baseUrl: optional(pipe(string(), title('Base URL'), description('Custom base URL (optional)')), 'https://openrouter.ai/api/v1/'),
      }),
    ),
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: 'i-lobe-icons:openai',
    fields: toJsonSchema(
      object({
        apiKey: pipe(string(), title('API Key'), description('API Key for OpenAI services')),
        baseUrl: optional(pipe(string(), title('Base URL'), description('Custom base URL (optional)')), 'https://api.openai.com/v1/'),
      }),
    ),
  },
  {
    id: 'ollama-ai',
    name: 'Ollama',
    icon: 'i-lobe-icons:ollama',
    fields: toJsonSchema(
      object({
        baseUrl: optional(pipe(string(), title('Host'), description('Host of the Ollama instance (optional)'))),
        extraHeaders: optional(pipe(record(string(), string()), title('Headers'), description('Custom Headers for Ollama instance (optional)'))),
      }),
    ),
  },
  {
    id: 'vllm',
    name: 'vLLM',
    icon: 'i-lobe-icons:vllm-color',
    fields: toJsonSchema(
      object({
        baseUrl: optional(pipe(string(), title('Host'), description('Host of the vLLM instance (optional)'))),
        apiKey: optional(pipe(string(), title('API Key'), description('API Key for vLLM'))),
        extraHeaders: optional(pipe(record(string(), string()), title('Headers'), description('Custom Headers for vLLM instance (optional)'))),
      }),
    ),
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    icon: 'i-simple-icons:elevenlabs',
    fields: toJsonSchema(
      object({
        apiKey: pipe(string(), title('API Key'), description('API Key for ElevenLabs')),
        baseUrl: optional(pipe(string(), title('Base URL'), description('Custom base URL (optional)'))),
      }),
    ),
  },
  {
    id: 'xai',
    name: 'xAI',
    icon: 'i-lobe-icons:xai',
    fields: toJsonSchema(
      object({
        apiKey: pipe(string(), title('API Key'), description('API Key for xAI')),
        baseUrl: optional(pipe(string(), title('Base URL'), description('Custom base URL (optional)')), 'https://api.x.ai/v1/'),
      }),
    ),
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: 'i-lobe-icons:deepseek-color',
    fields: toJsonSchema(
      object({
        apiKey: pipe(string(), title('API Key'), description('API Key for DeepSeek')),
        baseUrl: optional(pipe(string(), title('Base URL'), description('Custom base URL (optional)')), 'https://api.deepseek.com/'),
      }),
    ),
  },
  {
    id: 'together-ai',
    name: 'Together.ai',
    icon: 'i-lobe-icons:together-color',
    fields: toJsonSchema(
      object({
        apiKey: pipe(string(), title('API Key'), description('API Key for Together.ai')),
        baseUrl: optional(pipe(string(), title('Base URL'), description('Custom base URL (optional)')), 'https://api.together.xyz/v1/'),
      }),
    ),
  },
  {
    id: 'novita-ai',
    name: 'Novita',
    icon: 'i-lobe-icons:novita-color',
    fields: toJsonSchema(
      object({
        apiKey: pipe(string(), title('API Key'), description('API Key for Novita')),
        baseUrl: optional(pipe(string(), title('Base URL'), description('Custom base URL (optional)')), 'https://api.novita.ai/v3/openai/'),
      }),
    ),
  },
  {
    id: 'fireworks-ai',
    name: 'Fireworks.ai',
    icon: 'i-lobe-icons:fireworks',
    fields: toJsonSchema(
      object({
        apiKey: pipe(string(), title('API Key'), description('API Key for Fireworks.ai')),
        baseUrl: optional(pipe(string(), title('Base URL'), description('Custom base URL (optional)')), 'https://api.fireworks.ai/inference/v1/'),
      }),
    ),
  },
  {
    id: 'cloudflare-workers-ai',
    name: 'Cloudflare Workers AI',
    icon: 'i-lobe-icons:cloudflare-color',
    fields: toJsonSchema(
      object({
        apiKey: pipe(string(), title('API Key'), description('API Key')),
        accountId: pipe(string(), title('Account ID'), description('Cloudflare Account ID')),
      }),
    ),
  },
  {
    id: 'mistral-ai',
    name: 'Mistral',
    icon: 'i-lobe-icons:mistral-color',
    fields: toJsonSchema(
      object({
        apiKey: pipe(string(), title('API Key'), description('API Key for OpenRouter')),
        baseUrl: optional(pipe(string(), title('Base URL'), description('Custom base URL (optional)')), 'https://api.mistral.ai/v1/'),
      }),
    ),
  },
  {
    id: 'moonshot-ai',
    name: 'Moonshot AI',
    icon: 'i-lobe-icons:moonshot',
    fields: toJsonSchema(
      object({
        apiKey: pipe(string(), title('API Key'), description('API Key for OpenRouter')),
        baseUrl: optional(pipe(string(), title('Base URL'), description('Custom base URL (optional)')), 'https://api.moonshot.cn/v1/'),
      }),
    ),
  },
])

const providerValues = ref<Record<string, Record<string, string>>>({})

function getFieldValue(providerId: string, fieldName: string): string {
  return providerValues.value[providerId]?.[fieldName] || ''
}

function setFieldValue(providerId: string, fieldName: string, value: string) {
  if (!providerValues.value[providerId]) {
    providerValues.value[providerId] = {}
  }
  providerValues.value[providerId][fieldName] = value
}

function getRecordEntries(providerId: string, fieldName: string): Array<[string, string]> {
  const value = providerValues.value[providerId]?.[fieldName]
  if (!value)
    return [['', '']]
  try {
    return Object.entries(JSON.parse(value))
  }
  catch {
    return [['', '']]
  }
}

function setRecordValue(providerId: string, fieldName: string, entries: Array<[string, string]>) {
  const validEntries = entries.filter(([key, value]) => key || value)
  if (validEntries.length === 0) {
    delete providerValues.value[providerId]?.[fieldName]
    return
  }

  const record = Object.fromEntries(validEntries)
  setFieldValue(providerId, fieldName, JSON.stringify(record))
}

function addRecordEntry(entries: Array<[string, string]>) {
  entries.push(['', ''])
}

function removeRecordEntry(entries: Array<[string, string]>, index: number) {
  entries.splice(index, 1)
}
</script>

<template>
  <div flex="~ col" gap-2>
    <div v-for="provider in providers" :key="provider.id">
      <Collapsable w-full>
        <template #trigger="slotProps">
          <button
            bg="zinc-100 dark:zinc-800"
            hover="bg-zinc-200 dark:bg-zinc-700"
            transition="all ease-in-out duration-250"
            w-full flex items-center gap-1.5 rounded-lg px-4 py-3 outline-none
            class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
            @click="slotProps.setVisible(!slotProps.visible)"
          >
            <div flex="~ row 1" items-center gap-1.5>
              <div
                :class="provider.icon" class="provider-icon size-6"
                transition="filter duration-250 ease-in-out"
              />
              <div>
                {{ provider.name }}
              </div>
            </div>
            <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
              <div i-solar:alt-arrow-down-bold-duotone />
            </div>
          </button>
        </template>
        <div p-4>
          <div class="space-y-4">
            <!-- Dynamically render fields based on JSON Schema -->
            <div
              v-for="(field, fieldName) in provider.fields.properties"
              :key="fieldName"
              class="space-y-1"
            >
              <template v-if="typeof field !== 'boolean' && typeof fieldName !== 'number' && field.type === 'object' && field.additionalProperties">
                <!-- Record field (key-value pairs) -->
                <div>
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="flex items-center gap-1 text-sm font-medium">
                        {{ field.title || fieldName }}
                        <span v-if="provider.fields.required?.includes(fieldName)" class="text-red-500">*</span>
                      </div>
                      <div v-if="field.description" class="text-xs text-zinc-500 dark:text-zinc-400">
                        {{ field.description }}
                      </div>
                    </div>
                    <button
                      class="text-sm"
                      @click="addRecordEntry(getRecordEntries(provider.id, fieldName))"
                    >
                      <div i-solar:add-circle-line-duotone />
                    </button>
                  </div>
                  <div class="mt-2 space-y-2">
                    <div
                      v-for="(_, index) in getRecordEntries(provider.id, fieldName)"
                      :key="index"
                      class="flex items-center gap-2"
                    >
                      <input
                        v-model="getRecordEntries(provider.id, fieldName)[index][0]"
                        type="text"
                        border="zinc-300 dark:zinc-800 solid 1 focus:zinc-400 dark:focus:zinc-600"
                        transition="border duration-250 ease-in-out"
                        flex-1 rounded px-2 py-1 text-sm outline-none
                        placeholder="Key"
                        @input="setRecordValue(provider.id, fieldName, getRecordEntries(provider.id, fieldName))"
                      >
                      <input
                        v-model="getRecordEntries(provider.id, fieldName)[index][1]"
                        type="text"
                        border="zinc-300 dark:zinc-800 solid 1 focus:zinc-400 dark:focus:zinc-600"
                        transition="border duration-250 ease-in-out"
                        flex-1 rounded px-2 py-1 text-sm outline-none
                        placeholder="Value"
                        @input="setRecordValue(provider.id, fieldName, getRecordEntries(provider.id, fieldName))"
                      >
                      <button
                        class="text-red-500 hover:text-red-600"
                        @click="removeRecordEntry(getRecordEntries(provider.id, fieldName), index)"
                      >
                        <div i-solar:trash-bin-trash-bold-duotone />
                      </button>
                    </div>
                  </div>
                </div>
              </template>
              <template v-if="typeof field !== 'boolean' && typeof fieldName !== 'number' && field.type === 'string'">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="flex items-center gap-1 text-sm font-medium">
                      {{ field.title }}
                      <span
                        v-if="provider.fields.required?.includes(fieldName)"
                        class="text-red-500"
                      >*</span>
                    </div>
                    <div v-if="field.description" class="text-xs text-zinc-400 dark:text-zinc-600">
                      {{ field.description }}
                    </div>
                  </div>
                  <input
                    :type="fieldName.toLowerCase().includes('key') ? 'password' : 'text'"
                    :value="getFieldValue(provider.id, fieldName)"
                    rounded
                    border="zinc-300 dark:zinc-800 solid 1 focus:zinc-400 dark:focus:zinc-600"
                    transition="border duration-250 ease-in-out"
                    px-2 py-1 text-sm outline-none
                    :placeholder="(field.default && String(field.default)) || `Enter ${field.title || fieldName}`"
                    @input="(e) => setFieldValue(provider.id, fieldName, (e.target as HTMLInputElement).value)"
                  >
                </div>
              </template>
            </div>
          </div>
        </div>
      </Collapsable>
    </div>
  </div>
</template>
