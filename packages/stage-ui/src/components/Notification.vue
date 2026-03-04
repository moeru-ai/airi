<template>
  <div class="notification-container" v-if="notifications.length > 0">
    <div
      v-for="notification in notifications"
      :key="notification.id"
      :class="['notification-item', notification.type]"
      @click="closeNotification(notification.id)"
    >
      <div class="notification-icon">
        <span v-if="notification.type === 'success'">✓</span>
        <span v-else-if="notification.type === 'error'">✗</span>
        <span v-else-if="notification.type === 'warning'">⚠️</span>
        <span v-else>ℹ️</span>
      </div>
      <div class="notification-content">
        <h4 v-if="notification.title">{{ notification.title }}</h4>
        <p>{{ notification.message }}</p>
      </div>
      <button class="notification-close" @click.stop="closeNotification(notification.id)">
        ×
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface Notification {
  id: string
  title?: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

const notifications = ref<Notification[]>([])
let nextId = 1

function showNotification(options: {
  title?: string
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}) {
  const id = `notification-${nextId++}`
  const notification: Notification = {
    id,
    title: options.title,
    message: options.message,
    type: options.type || 'info',
    duration: options.duration || 3000
  }

  notifications.value.push(notification)

  // Auto remove after duration
  setTimeout(() => {
    closeNotification(id)
  }, notification.duration)

  return id
}

function closeNotification(id: string) {
  const index = notifications.value.findIndex(n => n.id === id)
  if (index > -1) {
    notifications.value.splice(index, 1)
  }
}

function clearAllNotifications() {
  notifications.value = []
}

defineExpose({
  showNotification,
  closeNotification,
  clearAllNotifications
})
</script>

<style scoped>
.notification-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 400px;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: slideIn 0.3s ease-in-out;
  cursor: pointer;
  transition: all 0.2s ease;
}

.notification-item:hover {
  transform: translateX(-5px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.notification-icon {
  font-size: 1.2rem;
  font-weight: bold;
  margin-right: 12px;
  min-width: 24px;
  text-align: center;
}

.notification-content {
  flex: 1;
}

.notification-content h4 {
  margin: 0 0 4px 0;
  font-size: 1rem;
  font-weight: 600;
}

.notification-content p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
}

.notification-close {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.5);
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.notification-close:hover {
  background: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.8);
}

.notification-item.success {
  background: #d4edda;
  color: #155724;
}

.notification-item.error {
  background: #f8d7da;
  color: #721c24;
}

.notification-item.warning {
  background: #fff3cd;
  color: #856404;
}

.notification-item.info {
  background: #d1ecf1;
  color: #0c5460;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .notification-container {
    top: 10px;
    right: 10px;
    left: 10px;
    max-width: none;
  }

  .notification-item {
    padding: 12px;
  }
}
</style>