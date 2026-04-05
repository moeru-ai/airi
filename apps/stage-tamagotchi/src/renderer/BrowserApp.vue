<script setup lang="ts">
import { ToasterRoot } from '@proj-airi/stage-ui/components'
import { RouterView } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'
</script>

<template>
  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>
  <RouterView />
</template>
