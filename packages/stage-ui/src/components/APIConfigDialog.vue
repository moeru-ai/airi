<template>
  <div v-if="isVisible" class="api-config-dialog-overlay">
    <div class="api-config-dialog">
      <div class="dialog-header">
        <h2>{{ t('api.config.title') }}</h2>
        <button @click="closeDialog" class="close-button">×</button>
      </div>
      <div class="dialog-content">
        <div class="form-group">
          <label for="provider">{{ t('api.config.provider') }}</label>
          <select
            id="provider"
            v-model="form.provider"
            class="form-select"
            @change="onProviderChange"
          >
            <option value="">{{ t('api.config.selectProvider') }}</option>
            <option
              v-for="(provider, key) in providers"
              :key="key"
              :value="key"
            >
              {{ provider.name }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label for="apiKey">{{ t('api.config.apiKey') }}</label>
          <input
            type="password"
            id="apiKey"
            v-model="form.apiKey"
            class="form-input"
            :placeholder="t('api.config.apiKeyPlaceholder')"
          />
          <div class="input-hint">{{ t('api.config.apiKeyHint') }}</div>
        </div>

        <div class="form-group">
          <label for="baseUrl">{{ t('api.config.baseUrl') }}</label>
          <input
            type="url"
            id="baseUrl"
            v-model="form.baseUrl"
            class="form-input"
            :placeholder="t('api.config.baseUrlPlaceholder')"
          />
          <div class="input-hint">{{ t('api.config.baseUrlHint') }}</div>
        </div>

        <div class="form-group" v-if="showModelSelector">
          <label for="model">{{ t('api.config.model') }}</label>
          <select
            id="model"
            v-model="form.model"
            class="form-select"
            :disabled="!models.length"
          >
            <option value="">{{ t('api.config.selectModel') }}</option>
            <option
              v-for="model in models"
              :key="model.id"
              :value="model.id"
            >
              {{ model.name || model.id }}
            </option>
          </select>
          <div class="input-hint" v-if="!models.length">{{ t('api.config.loadingModels') }}</div>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <div v-if="loading" class="loading-indicator">
          {{ t('api.config.testingConnection') }}
        </div>
      </div>
      <div class="dialog-footer">
        <button @click="closeDialog" class="cancel-button">
          {{ t('api.config.cancel') }}
        </button>
        <button
          @click="testConnection"
          class="test-button"
          :disabled="!isFormValid || loading"
        >
          {{ t('api.config.testConnection') }}
        </button>
        <button
          @click="saveConfig"
          class="save-button"
          :disabled="!isFormValid || loading"
        >
          {{ t('api.config.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAPIConfig } from '../composables/useAPIConfig'
import { useProvidersStore } from '../stores/providers'

const { t } = useI18n()
const isVisible = ref(false)
const loading = ref(false)
const error = ref('')
const models = ref<any[]>([])
const showModelSelector = ref(false)

const { config, saveConfig: saveAPIConfig, testConnection: testAPIConnection } = useAPIConfig()
const providersStore = useProvidersStore()

const providers = computed(() => {
  return providersStore.providerMetadata
})

const form = ref({
  provider: '',
  apiKey: '',
  baseUrl: '',
  model: ''
})

const isFormValid = computed(() => {
  return form.value.provider &&
         form.value.apiKey &&
         form.value.baseUrl
})

function openDialog() {
  // Load current config if available
  if (config.value.provider) {
    form.value = { ...config.value }
  } else {
    // Reset form
    form.value = {
      provider: '',
      apiKey: '',
      baseUrl: '',
      model: ''
    }
  }
  error.value = ''
  models.value = []
  showModelSelector.value = false
  isVisible.value = true
}

function closeDialog() {
  isVisible.value = false
  error.value = ''
  loading.value = false
}

async function onProviderChange() {
  if (form.value.provider) {
    const provider = providers.value[form.value.provider]
    if (provider && provider.defaultBaseUrl) {
      form.value.baseUrl = provider.defaultBaseUrl
    }
    // Reset model selection
    models.value = []
    showModelSelector.value = false
  }
}

async function testConnection() {
  if (!isFormValid.value) return

  loading.value = true
  error.value = ''

  try {
    const result = await testAPIConnection(form.value)
    if (result.success) {
      error.value = `✓ ${result.message}`
      // Load models if available
      if (result.models && result.models.length > 0) {
        models.value = result.models
        showModelSelector.value = true
        // Set first model as default if not set
        if (!form.value.model) {
          form.value.model = result.models[0].id
        }
      }
    } else {
      error.value = `✗ ${result.message}`
    }
  } catch (err) {
    error.value = `✗ ${t('api.config.connectionFailed')}: ${String(err)}`
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  if (!isFormValid.value) return

  loading.value = true
  error.value = ''

  try {
    const result = await saveAPIConfig(form.value)
    error.value = `✓ ${result.message}`
    // Close dialog after a short delay
    setTimeout(() => {
      closeDialog()
    }, 1000)
  } catch (err) {
    error.value = `✗ ${String(err)}`
  } finally {
    loading.value = false
  }
}

defineExpose({
  openDialog,
  closeDialog
})
</script>

<style scoped>
.api-config-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.api-config-dialog {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e9ecef;
}

.dialog-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #333;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.close-button:hover {
  background: #f8f9fa;
  color: #333;
}

.dialog-content {
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
}

.form-input,
.form-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 1rem;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: #80bdff;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.input-hint {
  font-size: 0.875rem;
  color: #6c757d;
  margin-top: 4px;
}

.error-message {
  background-color: #f8d7da;
  color: #721c24;
  padding: 10px;
  border-radius: 4px;
  margin-top: 15px;
  font-size: 0.9rem;
}

.loading-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  margin-top: 15px;
  color: #6c757d;
  font-size: 0.9rem;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 20px;
  border-top: 1px solid #e9ecef;
  background: #f8f9fa;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  gap: 10px;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancel-button {
  background: #6c757d;
  color: white;
}

.cancel-button:hover:not(:disabled) {
  background: #5a6268;
}

.test-button {
  background: #17a2b8;
  color: white;
}

.test-button:hover:not(:disabled) {
  background: #138496;
}

.save-button {
  background: #28a745;
  color: white;
}

.save-button:hover:not(:disabled) {
  background: #218838;
}

@media (max-width: 768px) {
  .api-config-dialog {
    width: 95%;
    margin: 20px;
  }

  .dialog-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .dialog-footer button {
    width: 100%;
    margin-bottom: 10px;
  }

  .dialog-footer button:last-child {
    margin-bottom: 0;
  }
}
</style>