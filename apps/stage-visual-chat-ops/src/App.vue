<script setup lang="ts">
import { ref } from 'vue'

const currentPage = ref<'rooms' | 'sessions' | 'devices' | 'models' | 'logs'>('rooms')
</script>

<template>
  <div class="app">
    <nav class="sidebar">
      <h2>AIRI Visual Chat</h2>
      <ul>
        <li :class="{ active: currentPage === 'rooms' }" @click="currentPage = 'rooms'">
          Rooms
        </li>
        <li :class="{ active: currentPage === 'sessions' }" @click="currentPage = 'sessions'">
          Sessions
        </li>
        <li :class="{ active: currentPage === 'devices' }" @click="currentPage = 'devices'">
          Devices
        </li>
        <li :class="{ active: currentPage === 'models' }" @click="currentPage = 'models'">
          Models
        </li>
        <li :class="{ active: currentPage === 'logs' }" @click="currentPage = 'logs'">
          Logs
        </li>
      </ul>
    </nav>
    <main class="content">
      <h1>{{ currentPage }}</h1>
      <p>Page content for {{ currentPage }} will be implemented here.</p>
    </main>
  </div>
</template>

<style scoped>
.app { display: flex; height: 100vh; font-family: system-ui, sans-serif; }
.sidebar { width: 200px; background: #1a1a2e; color: #e0e0e0; padding: 1rem; }
.sidebar h2 { font-size: 1rem; margin-bottom: 1rem; }
.sidebar ul { list-style: none; padding: 0; }
.sidebar li { padding: 0.5rem; cursor: pointer; border-radius: 4px; margin-bottom: 2px; }
.sidebar li:hover { background: #16213e; }
.sidebar li.active { background: #0f3460; color: #e94560; }
.content { flex: 1; padding: 2rem; }
</style>
