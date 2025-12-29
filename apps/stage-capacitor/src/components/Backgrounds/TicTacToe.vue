<template>
  <div class="tic-tac-toe-background-container">
    <slot />
  </div>
</template>

<style scoped>
/*
Hero Patterns | Free repeatable SVG background patterns for your web projects
https://heropatterns.com/
*/
.tic-tac-toe-background-container {
  background-color: transparent;
  background-image: url("data:image/svg+xml,%3Csvg width='64' height='64' viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 16c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8zm0-2c3.314 0 6-2.686 6-6s-2.686-6-6-6-6 2.686-6 6 2.686 6 6 6zm33.414-6l5.95-5.95L45.95.636 40 6.586 34.05.636 32.636 2.05 38.586 8l-5.95 5.95 1.414 1.414L40 9.414l5.95 5.95 1.414-1.414L41.414 8zM40 48c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8zm0-2c3.314 0 6-2.686 6-6s-2.686-6-6-6-6 2.686-6 6 2.686 6 6 6zM9.414 40l5.95-5.95-1.414-1.414L8 38.586l-5.95-5.95L.636 34.05 6.586 40l-5.95 5.95 1.414 1.414L8 41.414l5.95 5.95 1.414-1.414L9.414 40z' fill='%23ffcfe1' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E");
  background-position: 0 0;
  position: relative;
  overflow: hidden;
  transition: transform 0.3s ease;
}

.tic-tac-toe-background-container:hover {
  transform: scale(1.02);
  animation: slideBackground 2s linear infinite;
}

@keyframes slideBackground {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 64px -64px; /* Match the SVG size for smooth looping */
  }
}
</style>
