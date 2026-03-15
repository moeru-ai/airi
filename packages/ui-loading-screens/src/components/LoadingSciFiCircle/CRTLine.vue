<template>
  <div class="glitch-content" whitespace-pre-wrap>
    <slot />
  </div>
</template>

<style scoped>
/**
 * Glitch part inspired by:
 * https://codepen.io/shorinamaria/pen/egJmeY
 */
.glitch-content {
  position: relative;
  filter: blur(var(--glitch-blur));
  animation: glitch-skew var(--glitch-blink-speed) infinite,
             glitch-flash var(--glitch-flash-freq) infinite;
}

.glitch-content::before,
.glitch-content::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  width: 100%;
  height: 100%;
  mix-blend-mode: screen;
  pointer-events: none;
}

.glitch-content::before {
  left: calc(var(--glitch-offset) * -2);
  color: rgba(255, 0, 0, 0.05);
}

.glitch-content::after {
  left: calc(var(--glitch-offset) * 1);
  color: rgba(0, 0, 255, 0.2);
}

@keyframes glitch-skew {
  0% { transform: none; }
  30% { transform: none; }
  30.2% { transform: skewX(var(--glitch-amplitude)); }
  30.4% { transform: skewX(calc(var(--glitch-amplitude) * -0.5)); }
  31% { transform: none; }
  100% { transform: none; }
}

@keyframes glitch-flash {
  0% { opacity: 1; }
  50% { opacity: 0.9; }
  100% { opacity: 1; }
}
</style>
