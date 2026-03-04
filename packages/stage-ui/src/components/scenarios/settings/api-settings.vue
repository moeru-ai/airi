<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button, Card, Callout } from '@proj-airi/ui'
import { useAPIConfig } from '../../../composables/useAPIConfig'
import APIConfigDialog from '../../../components/APIConfigDialog.vue'
import ErrorMessage from '../../../components/ErrorMessage.vue'
import Notification from '../../../components/Notification.vue'

const apiConfigDialog = ref<InstanceType<typeof APIConfigDialog> | null>(null)
const errorMessage = ref<InstanceType<typeof ErrorMessage> | null>(null)
const notification = ref<InstanceType<typeof Notification> | null>(null)

const { config, isConfigured, currentProvider, testConnection } = useAPIConfig()

async function openConfigDialog() {
  apiConfigDialog.value?.openDialog()
}

async function testCurrentConnection() {
  if (!isConfigured.value) {
    errorMessage.value?.showError({
      title: 'API 未配置',
      message: '请先配置API信息',
      solution: '点击"配置API"按钮进行设置'
    })
    return
  }

  try {
    const result = await testConnection(config.value)
    if (result.success) {
      notification.value?.showNotification({
        title: '连接测试成功',
        message: result.message,
        type: 'success'
      })
    } else {
      errorMessage.value?.showError({
        title: '连接测试失败',
        message: result.message,
        solution: '请检查API配置信息是否正确'
      })
    }
  } catch (error) {
    errorMessage.value?.showError({
      title: '连接测试失败',
      message: `测试连接时发生错误: ${String(error)}`,
      solution: '请检查网络连接和API配置信息'
    })
  }
}
</script>

<template>
  <div flex="~ col gap-4">
    <Card title="API 配置" class="api-settings-card">
      <div flex="~ col gap-4">
        <Callout v-if="!isConfigured" type="warning" label="API 未配置">
          <p>请配置API信息以使用AI功能</p>
          <p>我们支持国内AI服务，如Kimi、Doubao等，确保在国内网络环境下稳定连接</p>
        </Callout>

        <Callout v-else type="success" label="API 已配置">
          <p><strong>当前提供商:</strong> {{ currentProvider?.name }}</p>
          <p v-if="config.model"><strong>当前模型:</strong> {{ config.model }}</p>
          <p><strong>API 基础URL:</strong> {{ config.baseUrl }}</p>
        </Callout>

        <div flex="~ gap-2">
          <Button @click="openConfigDialog" variant="primary">
            配置API
          </Button>
          <Button @click="testCurrentConnection" variant="secondary" :disabled="!isConfigured">
            测试连接
          </Button>
        </div>
      </div>
    </Card>

    <APIConfigDialog ref="apiConfigDialog" />
    <ErrorMessage ref="errorMessage" />
    <Notification ref="notification" />
  </div>
</template>

<style scoped>
.api-settings-card {
  max-width: 800px;
}
</style>