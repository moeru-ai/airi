<script setup lang="ts">
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button, FieldCheckbox, FieldCombobox } from '@proj-airi/ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'

const authStore = useAuthStore()
const saving = ref(false)
const saved = ref(false)
const error = ref('')

const form = reactive({
  adultVerified: false,
  allowSensitiveContent: false,
  contentTier: 'standard' as 'standard' | 'sensitive' | 'explicit',
})

watch(() => authStore.profile, () => {
  form.adultVerified = authStore.adultVerified
  form.allowSensitiveContent = authStore.allowSensitiveContent
  form.contentTier = authStore.contentTier
}, { immediate: true, deep: true })

const contentTierOptions = computed(() => [
  { value: 'standard', label: 'Standard' },
  { value: 'sensitive', label: 'Sensitive' },
  { value: 'explicit', label: 'Explicit' },
])

onMounted(() => {
  authStore.fetchProfile().catch(() => {})
})

async function save() {
  saving.value = true
  saved.value = false
  error.value = ''

  try {
    await authStore.updateProfile({
      adultVerified: form.adultVerified,
      allowSensitiveContent: form.allowSensitiveContent,
      contentTier: form.contentTier,
    })
    saved.value = true
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save account settings'
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800">
    <FieldCheckbox
      v-model="form.adultVerified"
      label="Adult Verified"
      description="Marks this account as eligible for age-gated experiences."
    />

    <FieldCheckbox
      v-model="form.allowSensitiveContent"
      label="Allow Sensitive Content"
      description="Allows routes and requests that can enter the NSFW flow."
    />

    <FieldCombobox
      v-model="form.contentTier"
      label="Content Tier"
      description="Choose the highest content level this account is allowed to access."
      layout="horizontal"
      :options="contentTierOptions"
    />

    <div class="flex items-center gap-3">
      <Button :disabled="saving" @click="save">
        {{ saving ? 'Saving...' : 'Save Account Settings' }}
      </Button>
      <span v-if="saved" class="text-sm text-emerald-600 dark:text-emerald-400">
        Saved
      </span>
      <span v-if="error" class="text-sm text-rose-600 dark:text-rose-400">
        {{ error }}
      </span>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Account
  description: Account access and content gating
  icon: i-solar:user-id-bold-duotone
  settingsEntry: true
  order: 15
  stageTransition:
    name: slide
</route>
