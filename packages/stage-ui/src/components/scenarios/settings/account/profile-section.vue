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
  <div :class="['flex flex-col gap-6 p-8', 'border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-sm', 'bg-white dark:bg-neutral-900']">
    <div :class="['flex flex-col gap-1']">
      <h3 :class="['text-xl font-bold text-neutral-900 dark:text-white']">
        {{ t('settings.pages.account.profile.title') || 'Profile' }}
      </h3>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        Manage your public profile details and avatar.
      </p>
    </div>

    <Callout v-if="error" theme="orange" :label="error" />
    <Callout v-if="saveSuccess" theme="lime" :label="t('settings.pages.account.profile.saveSuccess') || 'Profile saved successfully!'" />

    <div :class="['flex flex-col md:flex-row gap-10 items-start mt-2']">
      <!-- Avatar Section -->
      <div :class="['flex flex-col items-center gap-5 min-w-[180px]']">
        <div :class="['size-36 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center border-[6px] border-white dark:border-neutral-900 shadow-md transition-transform hover:scale-105 duration-300']">
          <img
            v-if="authStore.user?.image"
            :src="authStore.user.image"
            :alt="authStore.user?.name || 'User'"
            :class="['size-full object-cover']"
          >
          <div
            v-else
            :class="['i-solar:user-circle-bold-duotone size-20 text-neutral-300 dark:text-neutral-600']"
          />
        </div>

        <div :class="['flex flex-col w-full gap-3']">
          <InputFileCard
            v-model="fileInputModel"
            accept="image/png,image/jpeg,image/webp,image/gif"
            :multiple="false"
            @update:model-value="handleFileUpload"
          >
            <template #default="{ isDragging }">
              <div :class="['flex flex-col items-center justify-center py-4 w-full rounded-xl transition-colors border border-dashed', isDragging ? 'text-primary-500 border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'text-neutral-500 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800']">
                <div :class="['i-solar:camera-add-bold-duotone text-2xl mb-1.5', isDragging ? 'text-primary-500' : 'text-neutral-400']" />
                <span :class="['text-xs text-center font-medium']">
                  {{ t('settings.pages.account.profile.uploadNew') || 'Upload Photo' }}
                </span>
                <span :class="['text-[10px] opacity-60 mt-1']">
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
            :class="['rounded-xl py-2']"
            :disabled="loading"
            @click="handleRemoveAvatar"
          >
            {{ t('settings.pages.account.profile.removeAvatar') || 'Remove Photo' }}
          </Button>
        </div>
      </div>

      <!-- Name Section -->
      <div :class="['flex-1 flex flex-col gap-6 w-full pt-1']">
        <div :class="['flex flex-col gap-1']">
          <FieldInput
            v-model="name"
            :label="t('settings.pages.account.profile.nameLabel') || 'Display Name'"
            :placeholder="t('settings.pages.account.profile.namePlaceholder') || 'Enter your name'"
            :disabled="loading"
            required
          />
          <span :class="['text-xs text-neutral-500 dark:text-neutral-400 ml-1 mt-1']">
            This is your public display name. It can be changed at any time.
          </span>
        </div>

        <div :class="['flex justify-start mt-2']">
          <Button
            variant="primary"
            :class="['rounded-xl px-6 py-2 shadow-sm font-medium']"
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
