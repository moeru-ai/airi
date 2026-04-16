<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import ConfirmDeleteDialog from '../../dialogs/confirm-delete/confirm-delete-dialog.vue'

import { useAccountManagement } from '../../../../composables/use-account-management'
import { signOut } from '../../../../libs/auth'

const router = useRouter()
const { deleteAccount } = useAccountManagement()
const showDeleteDialog = ref(false)

async function handleConfirmDelete() {
  await deleteAccount()
  await signOut()
  router.push('/')
}
</script>

<template>
  <div :class="['rounded-lg border border-red-200 p-6 dark:border-red-800/50']">
    <div :class="['flex flex-col gap-4']">
      <div :class="['flex items-center gap-2 text-red-600 dark:text-red-400']">
        <div class="i-lucide:alert-triangle h-5 w-5" />
        <h3 :class="['text-lg font-semibold']">
          Danger Zone
        </h3>
      </div>

      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        Permanently delete your account and all associated data. This action cannot be undone after the grace period.
      </p>

      <div :class="['mt-2 flex']">
        <Button variant="danger" @click="showDeleteDialog = true">
          Delete Account
        </Button>
      </div>
    </div>

    <ConfirmDeleteDialog
      v-model:open="showDeleteDialog"
      expected-text="DELETE"
      title="Delete Account"
      description="This will permanently delete your account. All your data will be removed after a grace period."
      @confirm="handleConfirmDelete"
      @cancel="showDeleteDialog = false"
    />
  </div>
</template>
