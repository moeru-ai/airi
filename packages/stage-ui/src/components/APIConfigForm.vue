<template>
  <div class="api-config-form">
    <div class="form-header">
      <h3>{{ t('api.config.title') }}</h3>
      <p>{{ t('api.config.description') }}</p>
    </div>

    <form @submit.prevent="handleSubmit" class="config-form">
      <div class="form-group">
        <label for="provider" class="form-label">
          {{ t('api.config.provider') }}
        </label>
        <select
          id="provider"
          v-model="formData.provider"
          @change="handleProviderChange"
          class="form-select"
        >
          <option value="">{{ t('api.config.selectProvider') }}</option>
          <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
            {{ provider.name }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label for="apiKey" class="form-label">
          {{ t('api.config.apiKey') }}
        </label>
        <div class="input-group">
          <input
            type="password"
            id="apiKey"
            v-model="formData.apiKey"
            :placeholder="t('api.config.apiKeyPlaceholder')"
            class="form-input"
          />
          <button
            type="button"
            @click="toggleApiKeyVisibility"
            class="input-toggle"
          >
            {{ showApiKey ? '👁️' : '👁️‍🗨️' }}
          </button>
        </div>
      </div>

      <div class="form-group">
        <label for="baseUrl" class="form-label">
          {{ t('api.config.baseUrl') }}
        </label>
        <input
          type="url"
          id="baseUrl"
          v-model="formData.baseUrl"
          :placeholder="t('api.config.baseUrlPlaceholder')"
          class="form-input"
        />
      </div>

      <div v-if="customFields.length > 0" class="custom-fields">
        <h4>{{ t('api.config.customFields') }}</h4>
        <div
          v-for="field in customFields"
          :key="field.name"
          class="form-group"
        >
          <label :for="field.name" class="form-label">
            {{ field.label }}
          </label>
          <input
            :type="field.type || 'text'"
            :id="field.name"
            v-model="formData[field.name]"
            :placeholder="field.placeholder"
            class="form-input"
          />
        </div>
      </div>

      <div class="form-actions">
        <button
          type="button"
          @click="testConnection"
          :disabled="isTesting"
          class="test-button"
        >
          <span v-if="!isTesting">{{ t('api.config.testConnection') }}</span>
          <span v-else>{{ t('api.config.testing') }}</span>
        </button>
        <button
          type="submit"
          :disabled="!isFormValid"
          class="submit-button"
        >
          {{ t('api.config.save') }}
        </button>
      </div>

      <div v-if="testResult" :class="['test-result', testResult.status]">
        <span class="test-result-message">{{ testResult.message }}</span>
      </div>
    </form>

    <div class="form-help">
      <h4>{{ t('api.config.help.title') }}</h4>
      <ul class="help-list">
        <li>{{ t('api.config.help.tip1') }}</li>
        <li>{{ t('api.config.help.tip2') }}</li>
        <li>{{ t('api.config.help.tip3') }}</li>
        <li>{{ t('api.config.help.tip4') }}</li>
      </ul>
      <a
        href="/docs/api-guide"
        target="_blank"
        rel="noopener noreferrer"
        class="help-link"
      >
        {{ t('api.config.help.link') }}
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useProvidersStore } from '../stores/providers'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const providersStore = useProvidersStore()

const formData = ref({
  provider: '',
  apiKey: '',
  baseUrl: '',
})

const showApiKey = ref(false)
const isTesting = ref(false)
const testResult = ref<{ status: 'success' | 'error'; message: string } | null>(null)

const availableProviders = computed(() => {
  return Object.values(providersStore.providerMetadata)
    .filter(provider => provider.category === 'chat')
    .map(provider => ({
      id: provider.id,
      name: provider.name,
    }))
})

const customFields = ref<any[]>([])

const isFormValid = computed(() => {
  return formData.value.provider &&
         formData.value.apiKey &&
         formData.value.baseUrl
})

function toggleApiKeyVisibility() {
  showApiKey.value = !showApiKey.value
}

function handleProviderChange() {
  const providerId = formData.value.provider
  if (!providerId) return

  const provider = providersStore.providerMetadata[providerId]
  if (provider?.defaultOptions) {
    const defaultOptions = provider.defaultOptions()
    formData.value = {
      ...formData.value,
      ...defaultOptions,
    }
  }

  // Reset test result when provider changes
  testResult.value = null
}

async function testConnection() {
  if (!isFormValid.value) return

  isTesting.value = true
  testResult.value = null

  try {
    const providerId = formData.value.provider
    const provider = providersStore.providerMetadata[providerId]

    if (!provider) {
      throw new Error(t('api.config.error.invalidProvider'))
    }

    const validation = await provider.validators.validateProviderConfig(formData.value)

    if (validation.valid) {
      testResult.value = {
        status: 'success',
        message: t('api.config.test.success'),
      }
    } else {
      testResult.value = {
        status: 'error',
        message: validation.reason || t('api.config.test.failure'),
      }
    }
  } catch (error) {
    testResult.value = {
      status: 'error',
      message: t('api.config.test.error', { error: String(error) }),
    }
  } finally {
    isTesting.value = false
  }
}

function handleSubmit() {
  if (!isFormValid.value) return

  // Emit the form data to the parent component
  if (defineEmits) {
    defineEmits(['submit'])(formData.value)
  }
}

// Initialize with default values
watch(() => formData.value.provider, handleProviderChange, { immediate: true })
</script>

<style scoped>
.api-config-form {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.form-header {
  margin-bottom: 20px;
}

.form-header h3 {
  margin: 0 0 8px 0;
  font-size: 1.2rem;
  color: #333;
}

.form-header p {
  margin: 0;
  color: #666;
  font-size: 0.9rem;
}

.config-form {
  background: white;
  border-radius: 6px;
  padding: 20px;
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #333;
  font-size: 0.9rem;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9rem;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.form-input:focus {
  outline: none;
  border-color: #80bdff;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.form-select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9rem;
  background: white;
  cursor: pointer;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.form-select:focus {
  outline: none;
  border-color: #80bdff;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.input-group {
  position: relative;
  display: flex;
}

.input-toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.input-toggle:hover {
  background: #f8f9fa;
}

.custom-fields {
  margin: 20px 0;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 6px;
}

.custom-fields h4 {
  margin: 0 0 12px 0;
  font-size: 1rem;
  color: #333;
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

button {
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.test-button {
  background: #17a2b8;
  color: white;
}

.test-button:hover:not(:disabled) {
  background: #138496;
}

.submit-button {
  background: #28a745;
  color: white;
  flex: 1;
}

.submit-button:hover:not(:disabled) {
  background: #218838;
}

.test-result {
  margin-top: 16px;
  padding: 12px;
  border-radius: 4px;
  font-size: 0.9rem;
}

.test-result.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.test-result.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.form-help {
  background: white;
  border-radius: 6px;
  padding: 16px;
}

.form-help h4 {
  margin: 0 0 12px 0;
  font-size: 1rem;
  color: #333;
}

.help-list {
  margin: 0 0 16px 0;
  padding-left: 20px;
  color: #666;
  font-size: 0.9rem;
}

.help-list li {
  margin-bottom: 6px;
}

.help-link {
  color: #007bff;
  text-decoration: none;
  font-size: 0.9rem;
  transition: color 0.2s ease;
}

.help-link:hover {
  color: #0056b3;
  text-decoration: underline;
}
</style>
