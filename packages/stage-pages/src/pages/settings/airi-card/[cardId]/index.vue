<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import CardDetail from '../components/card-detail.vue'

const route = useRoute()
const router = useRouter()
const cardId = computed(() => String(route.params.cardId ?? ''))
const initialTab = computed(() => typeof route.query.tab === 'string' ? route.query.tab : '')

function handleBack() {
  void router.replace('/settings/airi-card')
}

function handleEdit(id: string) {
  void router.push(`/settings/airi-card/${encodeURIComponent(id)}/edit`)
}
</script>

<template>
  <CardDetail :card-id="cardId" :initial-tab="initialTab" @back="handleBack" @edit="handleEdit" />
</template>

<route lang="yaml">
meta:
  layout: plain
  titleKey: settings.pages.card.view-card
  stageTransition:
    name: slide
</route>
