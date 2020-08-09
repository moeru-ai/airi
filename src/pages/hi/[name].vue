<script setup lang="ts">
const router = useRouter()
const route = useRoute('/hi/[name]')
const user = useUserStore()
const { t } = useI18n()

watchEffect(() => {
  user.setNewName(route.params.name)
})
</script>

<template>
  <div>
    <div text-4xl>
      <div i-carbon-pedestrian inline-block />
    </div>
    <p>
      {{ t('intro.hi', { name: user.savedName }) }}
    </p>

    <p text-sm opacity-75>
      <em>{{ t('intro.dynamic-route') }}</em>
    </p>

    <template v-if="user.otherNames.length">
      <p mt-4 text-sm>
        <span opacity-75>{{ t('intro.aka') }}:</span>
        <ul>
          <li v-for="otherName in user.otherNames" :key="otherName">
            <RouterLink :to="`/hi/${otherName}`" replace>
              {{ otherName }}
            </RouterLink>
          </li>
        </ul>
      </p>
    </template>

    <div>
      <button
        m="3 t6" text-sm btn
        @click="router.back()"
      >
        {{ t('button.back') }}
      </button>
    </div>
  </div>
</template>
