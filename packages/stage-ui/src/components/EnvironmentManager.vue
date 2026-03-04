<template>
  <div class="environment-manager">
    <div class="header">
      <h2>{{ t('environment.manager.title') }}</h2>
      <p>{{ t('environment.manager.description') }}</p>
    </div>

    <div class="actions">
      <button
        @click="checkEnvironment"
        :disabled="state.isChecking"
        class="check-button"
      >
        <span v-if="!state.isChecking">{{ t('environment.manager.check') }}</span>
        <span v-else>{{ t('environment.manager.checking') }}</span>
      </button>
      <button
        @click="oneClickDeploy"
        :disabled="state.isInstalling"
        class="deploy-button"
      >
        <span v-if="!state.isInstalling">{{ t('environment.manager.deploy') }}</span>
        <span v-else>{{ t('environment.manager.deploying') }}</span>
      </button>
    </div>

    <div v-if="state.lastCheckTime" class="last-check">
      {{ t('environment.manager.lastCheck', { time: formatTime(state.lastCheckTime) }) }}
    </div>

    <div v-if="state.checkResults.length > 0" class="check-results">
      <div
        v-for="(result, index) in state.checkResults"
        :key="index"
        :class="['result-item', result.status]"
      >
        <div class="result-header">
          <span class="result-name">{{ result.name }}</span>
          <span :class="['result-status', result.status]">
            {{ t(`environment.status.${result.status}`) }}
          </span>
        </div>
        <div class="result-message">{{ result.message }}</div>
        <button
          v-if="result.action"
          @click="handleAction(result)"
          class="action-button"
        >
          {{ t(`environment.action.${result.action}`) }}
        </button>
      </div>
    </div>

    <div v-if="state.isInstalling" class="installation-progress">
      <div class="progress-header">
        <span>{{ state.installationStatus }}</span>
      </div>
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: `${state.installationProgress}%` }"
        ></div>
      </div>
      <div class="progress-percentage">{{ Math.round(state.installationProgress) }}%</div>
    </div>

    <div v-if="environmentStatus === 'success'" class="success-message">
      {{ t('environment.manager.allGood') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEnvironmentManager } from '../composables/useEnvironmentManager'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { state, environmentStatus, checkEnvironment, installMissingComponents, oneClickDeploy } = useEnvironmentManager()

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString()
}

function handleAction(result: any) {
  // Handle specific actions if needed
  installMissingComponents()
}
</script>

<style scoped>
.environment-manager {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header {
  margin-bottom: 20px;
}

.header h2 {
  margin: 0 0 8px 0;
  font-size: 1.5rem;
  color: #333;
}

.header p {
  margin: 0;
  color: #666;
  font-size: 0.9rem;
}

.actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
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

.check-button {
  background: #007bff;
  color: white;
}

.check-button:hover:not(:disabled) {
  background: #0069d9;
}

.deploy-button {
  background: #28a745;
  color: white;
}

.deploy-button:hover:not(:disabled) {
  background: #218838;
}

.last-check {
  font-size: 0.8rem;
  color: #666;
  margin-bottom: 16px;
}

.check-results {
  margin-bottom: 20px;
}

.result-item {
  background: white;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
  border-left: 4px solid #dee2e6;
}

.result-item.pass {
  border-left-color: #28a745;
}

.result-item.warn {
  border-left-color: #ffc107;
}

.result-item.fail {
  border-left-color: #dc3545;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.result-name {
  font-weight: 600;
  color: #333;
}

.result-status {
  font-size: 0.8rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.result-status.pass {
  background: #d4edda;
  color: #155724;
}

.result-status.warn {
  background: #fff3cd;
  color: #856404;
}

.result-status.fail {
  background: #f8d7da;
  color: #721c24;
}

.result-message {
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 8px;
}

.action-button {
  background: #17a2b8;
  color: white;
  font-size: 0.8rem;
  padding: 6px 12px;
}

.action-button:hover {
  background: #138496;
}

.installation-progress {
  background: white;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
}

.progress-header {
  margin-bottom: 10px;
  font-weight: 500;
  color: #333;
}

.progress-bar {
  background: #e9ecef;
  border-radius: 4px;
  height: 8px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  background: #28a745;
  height: 100%;
  transition: width 0.3s ease;
}

.progress-percentage {
  font-size: 0.8rem;
  color: #666;
  text-align: right;
}

.success-message {
  background: #d4edda;
  color: #155724;
  padding: 12px;
  border-radius: 6px;
  font-weight: 500;
}
</style>
