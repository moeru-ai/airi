<template>
  <div class="line-1-background-container">
    <slot />
  </div>
</template>

<style lang="css" scoped>
/*
Pattern Monster - SVG Pattern Generator
https://pattern.monster/
*/

.line-1-background-container {
  background-image: url("data:image/svg+xml,<svg id='patternId' width='100%' height='100%' xmlns='http://www.w3.org/2000/svg'><defs><pattern id='a' patternUnits='userSpaceOnUse' width='40' height='40' patternTransform='scale(8) rotate(45)'><rect x='0' y='0' width='100%' height='100%' fill='%23ffffffff'/><path d='M20-5V5m0 30v10m20-30v10M0 15v10'  stroke-linejoin='round' stroke-linecap='round' stroke-width='2' stroke='%23eee7e9ff' fill='none'/><path d='M-5 40H5M-5 0H5m30 0h10M35 40h10M15 20h10'  stroke-linejoin='round' stroke-linecap='round' stroke-width='2' stroke='%23efbcceff' fill='none'/></pattern></defs><rect width='800%' height='800%' transform='translate(-488,-456)' fill='url(%23a)'/></svg>");
}
</style>
