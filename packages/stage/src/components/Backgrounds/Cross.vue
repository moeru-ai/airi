<template>
  <div class="cross-background-container">
    <slot />
  </div>
</template>

<style lang="css" scoped>
/*
CSS Background Patterns by MagicPattern
https://www.magicpattern.design/tools/css-backgrounds
*/
.cross-background-container {
  background-color: #ffffff;
  opacity: 0.8;
  background:
    radial-gradient(circle, transparent 20%, #ffffff 20%, #ffffff 80%, transparent 80%, transparent),
    radial-gradient(circle, transparent 20%, #ffffff 20%, #ffffff 80%, transparent 80%, transparent) 25px 25px,
    linear-gradient(var(--airi-theme-primary-500) 2px, transparent 2px) 0 -1px,
    linear-gradient(90deg, var(--airi-theme-primary-500) 2px, #ffffff 2px) -1px 0;
  background-size:
    50px 50px,
    50px 50px,
    25px 25px,
    25px 25px;
}
</style>
