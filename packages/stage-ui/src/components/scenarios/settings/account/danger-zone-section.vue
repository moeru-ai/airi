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
  <div :class="['flex flex-col gap-6 p-8', 'rounded-2xl border border-red-200 dark:border-red-900/50 shadow-sm', 'bg-red-50/30 dark:bg-red-950/10']">
    <div :class="['flex flex-col gap-5']">
      <div :class="['flex items-center gap-3 text-red-600 dark:text-red-400']">
        <div :class="['p-2 rounded-lg bg-red-100 dark:bg-red-900/50']">
          <div class="i-lucide:alert-triangle size-5" />
        </div>
        <h3 :class="['text-xl font-bold']">
          Danger Zone
        </h3>
      </div>

      <div :class="['flex flex-col gap-1 mt-1']">
        <p :class="['text-sm font-medium text-neutral-900 dark:text-white']">
          Delete your account permanently
        </p>
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          This action will permanently delete your account and all associated data. This action cannot be undone after the grace period.
        </p>
      </div>

      <div :class="['mt-2 flex']">
        <Button variant="danger" :class="['rounded-xl px-6 py-2 shadow-sm font-medium']" @click="showDeleteDialog = true">
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
