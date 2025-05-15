# @proj-airi/ui-transitions

<p align="center">
  [<a href="https://proj-airi-packages-ui-transitions.netlify.app/">Try it</a>]
</p>

A set of UI transition animations for fade-in / fade-out of scenes.

## Usage

```shell
ni @proj-airi/ui-transitions -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @proj-airi/ui-transitions -D
yarn i @proj-airi/ui-transitions -D
npm i @proj-airi/ui-transitions -D
```

First, in your app layout component, wrap your router view with a `StageTransitionGroup`.

```vue
<script setup>
import { StageTransitionGroup } from '@proj-airi/ui-transitions'

const isDark = useDark()
</script>

<template>
  <div>
    <StageTransitionGroup
      :use-page-specific-transitions="false"
      <!--
        If `usePageSpecificTransitions` is true, it will allow page meta to override
        the parameters specified here with `pageSpecificAvailable`. Otherwise, values
        specified here will take precedence.

        All props are optional, each transition has its own default values.
      -->
      :primary-color="#FF5778"
      :secondary-color="#57FFB7"
      :tertiary-color="#FFB557"
      :colors="[/* override the default colors */]"
      :z-index="0"
      :disable-transitions="false"
    >
      <router-view v-slot="{ Component, route: r }">
        <component :is="Component" :key="r.path" />
      </router-view>
    </StageTransitionGroup>
  </div>
</template>
```

Then, in your page components, pass the `stageTransition` to meta of `definePage()`.

```vue
<script setup lang="ts">
import { definePage } from 'unplugin-vue-router/runtime'

definePage({
  meta: {
    stageTransition: {
      name: 'multiple-blocks-reveal',
      // All parameters below are optional, each transition has its own default values.

      // Common parameters like in `StageTransitionGroup`'s props.
      primaryColor: '#FF5778',
      secondaryColor: '#57FFB7',
      tertiaryColor: '#FFB557',
      direction: 'top',
      colors: [/* override the default colors */],
      zIndex: 0,
      // Sepcific parameters for this transition. See the available keys in each
      // transition's source code.
      duration: "0.6s",
      // Setting this to true will allow the parameters specified above to override
      // the parameters specified in `StageTransitionGroup`.
      // If `usePageSpecificTransitions` is false, this will be ignored.
      pageSpecificAvailable?: boolean
    },
  },
})
</script>
```

## License

[MIT](../../LICENSE)
