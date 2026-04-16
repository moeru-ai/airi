<script setup lang="ts">
import { Button, Callout, FieldInput, InputFileCard } from '@proj-airi/ui'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAccountManagement } from '../../../../composables/use-account-management'
import { useAuthStore } from '../../../../stores/auth'

const { t } = useI18n()
const authStore = useAuthStore()
const { updateProfile, uploadAvatar, removeAvatar, loading, error } = useAccountManagement()

const name = ref(authStore.user?.name ?? '')
const saveSuccess = ref(false)

async function saveName() {
  if (!name.value || name.value === authStore.user?.name)
    return

  await updateProfile({ name: name.value })
  saveSuccess.value = true
  setTimeout(() => {
    saveSuccess.value = false
  }, 3000)
}

function resizeImage(file: File, maxSize: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ratio = Math.min(maxSize / img.width, maxSize / img.height)
      canvas.width = img.width * ratio
      canvas.height = img.height * ratio

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], file.name, { type: file.type }))
        }
        else {
          reject(new Error('Canvas to Blob failed'))
        }
      }, file.type)
    }
    img.onerror = () => {
      reject(new Error('Failed to load image'))
    }
    img.src = URL.createObjectURL(file)
  })
}

const fileInputModel = ref<File[]>([])

async function handleFileUpload(files: File[]) {
  if (!files || files.length === 0)
    return

  const file = files[0]
  if (!file)
    return

  try {
    const resized = await resizeImage(file, 256)
    await uploadAvatar(resized)
  }
  finally {
    fileInputModel.value = [] // Reset file input
  }
}

async function handleRemoveAvatar() {
  await removeAvatar()
}
</script>

<template>
  <div :class="['flex flex-col gap-6 p-6', 'border border-neutral-200 dark:border-neutral-800 rounded-xl', 'bg-white dark:bg-neutral-900']">
    <h3 :class="['text-xl font-semibold']">
      {{ t('settings.pages.account.profile.title') || 'Profile' }}
    </h3>

    <Callout v-if="error" theme="orange" :label="error" />
    <Callout v-if="saveSuccess" theme="lime" :label="t('settings.pages.account.profile.saveSuccess') || 'Profile saved successfully!'" />

    <div :class="['flex flex-col md:flex-row gap-8 items-start']">
      <!-- Avatar Section -->
      <div :class="['flex flex-col items-center gap-4 min-w-[160px]']">
        <div :class="['size-32 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center border-4 border-white dark:border-neutral-900 shadow-sm']">
          <img
            v-if="authStore.user?.image"
            :src="authStore.user.image"
            :alt="authStore.user?.name || 'User'"
            :class="['size-full object-cover']"
          >
          <div
            v-else
            :class="['i-solar:user-circle-bold-duotone size-20 text-neutral-400']"
          />
        </div>

        <div :class="['flex flex-col w-full gap-2']">
          <InputFileCard
            v-model="fileInputModel"
            accept="image/png,image/jpeg,image/webp,image/gif"
            :multiple="false"
            @update:model-value="handleFileUpload"
          >
            <template #default="{ isDragging }">
              <div :class="['flex flex-col items-center justify-center h-full w-full', isDragging ? 'text-primary-500' : 'text-neutral-500']">
                <div :class="['i-solar:camera-add-bold-duotone text-2xl mb-1']" />
                <span :class="['text-xs text-center font-medium']">
                  {{ t('settings.pages.account.profile.uploadNew') || 'Upload New' }}
                </span>
                <span :class="['text-[10px] opacity-70 mt-1']">
                  Max 5MB
                </span>
              </div>
            </template>
          </InputFileCard>

          <Button
            v-if="authStore.user?.image"
            variant="danger"
            size="sm"
            block
            :disabled="loading"
            @click="handleRemoveAvatar"
          >
            {{ t('settings.pages.account.profile.removeAvatar') || 'Remove avatar' }}
          </Button>
        </div>
      </div>

      <!-- Name Section -->
      <div :class="['flex-1 flex flex-col gap-6 w-full pt-2']">
        <FieldInput
          v-model="name"
          :label="t('settings.pages.account.profile.nameLabel') || 'Display Name'"
          :placeholder="t('settings.pages.account.profile.namePlaceholder') || 'Enter your name'"
          :disabled="loading"
          required
        />

        <div :class="['flex justify-start']">
          <Button
            variant="primary"
            :loading="loading"
            :disabled="!name || name === authStore.user?.name"
            @click="saveName"
          >
            {{ t('settings.pages.account.profile.saveButton') || 'Save Changes' }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
