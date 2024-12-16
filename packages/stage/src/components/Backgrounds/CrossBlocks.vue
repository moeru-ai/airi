<template>
  <div class="cross-blocks-background-container">
    <slot />
  </div>
</template>

<style scoped>
/*
CSS pattern backgrounds by Super designer
https://superdesigner.co/tools/css-backgrounds
*/
.cross-blocks-background-container {
  background: linear-gradient(
      45deg,
      var(--airi-theme-primary-200) 10%,
      transparent 11%,
      transparent 89%,
      var(--airi-theme-primary-200) 90%
    ),
    linear-gradient(
      135deg,
      var(--airi-theme-primary-200) 10%,
      transparent 11%,
      transparent 89%,
      var(--airi-theme-primary-200) 90%
    ),
    radial-gradient(circle, transparent 25%, #ffffff 26%),
    linear-gradient(
      45deg,
      transparent 46%,
      var(--airi-theme-primary-200) 47%,
      var(--airi-theme-primary-200) 52%,
      transparent 53%
    ),
    linear-gradient(
      135deg,
      transparent 46%,
      var(--airi-theme-primary-200) 47%,
      var(--airi-theme-primary-200) 52%,
      transparent 53%
    );
  background-size: 3em 3em;
  background-color: #ffffff;
  opacity: 1;
}
</style>
