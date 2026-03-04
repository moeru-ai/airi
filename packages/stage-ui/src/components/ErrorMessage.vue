<template>
  <div v-if="isVisible" class="error-message-overlay" @click="closeMessage">
    <div class="error-message-container" @click.stop>
      <div class="error-header">
        <div class="error-icon">⚠️</div>
        <h3>{{ title }}</h3>
        <button @click="closeMessage" class="close-button">×</button>
      </div>
      <div class="error-content">
        <p>{{ message }}</p>
        <div v-if="details" class="error-details">
          <h4>{{ t('error.details') }}</h4>
          <p>{{ details }}</p>
        </div>
        <div v-if="solution" class="error-solution">
          <h4>{{ t('error.solution') }}</h4>
          <p>{{ solution }}</p>
        </div>
      </div>
      <div class="error-footer">
        <button @click="closeMessage" class="close-button-primary">
          {{ t('error.ok') }}
        </button>
        <button
          v-if="actionText && action"
          @click="handleAction"
          class="action-button"
        >
          {{ actionText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const isVisible = ref(false)
const title = ref('')
const message = ref('')
const details = ref('')
const solution = ref('')
const actionText = ref('')
const action = ref<(() => void) | null>(null)

function showError(options: {
  title?: string
  message: string
  details?: string
  solution?: string
  actionText?: string
  action?: () => void
}) {
  title.value = options.title || t('error.title')
  message.value = options.message
  details.value = options.details || ''
  solution.value = options.solution || ''
  actionText.value = options.actionText || ''
  action.value = options.action || null
  isVisible.value = true
}

function closeMessage() {
  isVisible.value = false
  // Reset values
  title.value = ''
  message.value = ''
  details.value = ''
  solution.value = ''
  actionText.value = ''
  action.value = null
}

function handleAction() {
  if (action.value) {
    action.value()
    closeMessage()
  }
}

defineExpose({
  showError,
  closeMessage
})
</script>

<style scoped>
.error-message-overlay {
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
  animation: fadeIn 0.3s ease-in-out;
}

.error-message-container {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  animation: slideIn 0.3s ease-in-out;
}

.error-header {
  display: flex;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e9ecef;
  background: #f8d7da;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}

.error-icon {
  font-size: 1.5rem;
  margin-right: 12px;
}

.error-header h3 {
  margin: 0;
  flex: 1;
  font-size: 1.2rem;
  color: #721c24;
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
  background: rgba(0, 0, 0, 0.1);
  color: #333;
}

.error-content {
  padding: 20px;
}

.error-content p {
  margin: 0 0 16px 0;
  color: #333;
  line-height: 1.5;
}

.error-details,
.error-solution {
  margin-top: 16px;
  padding: 12px;
  border-radius: 4px;
  background: #f8f9fa;
}

.error-details h4,
.error-solution h4 {
  margin: 0 0 8px 0;
  font-size: 1rem;
  color: #495057;
}

.error-details p,
.error-solution p {
  margin: 0;
  font-size: 0.9rem;
  color: #6c757d;
}

.error-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid #e9ecef;
  background: #f8f9fa;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  gap: 10px;
}

.close-button-primary {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: #6c757d;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
}

.close-button-primary:hover {
  background: #5a6268;
}

.action-button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: #007bff;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
}

.action-button:hover {
  background: #0069d9;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideIn {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .error-message-container {
    width: 95%;
    margin: 20px;
  }

  .error-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .error-footer button {
    width: 100%;
    margin-bottom: 10px;
  }

  .error-footer button:last-child {
    margin-bottom: 0;
  }
}
</style>