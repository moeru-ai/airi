<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div h-full w-full flex flex-col items-center justify-center gap-4>
    <div text-3xl>
      Where are we?
    </div>
    <div>
      <Button @click="router.go(-1)">
        Go Back
      </Button>
    </div>
  </div>
</template>
