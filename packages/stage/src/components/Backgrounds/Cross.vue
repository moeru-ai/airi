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
  background:
    radial-gradient(circle, transparent 20%, #ffffff 20%, #ffffff 80%, transparent 80%, transparent),
    radial-gradient(circle, transparent 20%, #ffffff 20%, #ffffff 80%, transparent 80%, transparent) 25px 25px,
    linear-gradient(#f4ebf1 2px, transparent 2px) 0 -1px,
    linear-gradient(90deg, #f4ebf1 2px, #ffffff 2px) -1px 0;
  background-size:
    50px 50px,
    50px 50px,
    25px 25px,
    25px 25px;
}

.dark .cross-background-container {
  background-color: #121212;
  background:
    radial-gradient(circle, transparent 20%, #121212 20%, #121212 80%, transparent 80%, transparent),
    radial-gradient(circle, transparent 20%, #121212 20%, #121212 80%, transparent 80%, transparent) 25px 25px,
    linear-gradient(#312129 2px, transparent 2px) 0 -1px,
    linear-gradient(90deg, #312129 2px, #121212 2px) -1px 0;
  background-size:
    50px 50px,
    50px 50px,
    25px 25px,
    25px 25px;
}
</style>
