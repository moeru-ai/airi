# @proj-airi/ui-loading-screens

<p align="center">
  [<a href="https://proj-airi-packages-ui-loading-screens.netlify.app/">Try it</a>]
</p>

The loading screens to show during long-time application startups.

## Usage

```shell
ni @proj-airi/ui-loading-screens -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @proj-airi/ui-loading-screens -D
yarn i @proj-airi/ui-loading-screens -D
npm i @proj-airi/ui-loading-screens -D
```

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { LoadingLogoWithBar } from '@proj-airi/ui-loading-screens'

const loadingLogoWithBar = ref<InstanceType<typeof LoadingLogoWithBar>>()

onMounted(() => {
  loadingLogoWithBar.value?.handleUpdateStep('Loading...')

  startLoading(progress => {
    if (progress >= 100) {
      loadingLogoWithBar.value?.handleUpdateDone(true)
      return
    }

    loadingLogoWithBar.value?.handleUpdateProgress(progress)
  })
})
</script>

<template>
  <LoadingLogoWithBar ref="loadingLogoWithBar">
    <div>
      Ready
    </div>
  </LoadingLogoWithBar>
</template>
```

## License

[MIT](../../LICENSE)
