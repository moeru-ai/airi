<template>
  <div class="transparent-preview">
    <div class="transparent-preview__label">
      Transparent
    </div>
  </div>
</template>

<style scoped>
.transparent-preview {
  display: flex;
  height: 100%;
  width: 100%;
  align-items: center;
  justify-content: center;
  background-color: rgb(255 255 255 / 0.92);
  background-image:
    linear-gradient(45deg, rgb(226 232 240 / 0.95) 25%, transparent 25%),
    linear-gradient(-45deg, rgb(226 232 240 / 0.95) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgb(226 232 240 / 0.95) 75%),
    linear-gradient(-45deg, transparent 75%, rgb(226 232 240 / 0.95) 75%);
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
  background-size: 16px 16px;
}

.transparent-preview__label {
  border: 1px solid rgb(255 255 255 / 0.7);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.78);
  padding: 0.35rem 0.75rem;
  color: rgb(51 65 85 / 0.9);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  backdrop-filter: blur(10px);
}

.dark .transparent-preview {
  background-color: rgb(23 23 23 / 0.92);
  background-image:
    linear-gradient(45deg, rgb(64 64 64 / 0.9) 25%, transparent 25%),
    linear-gradient(-45deg, rgb(64 64 64 / 0.9) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgb(64 64 64 / 0.9) 75%),
    linear-gradient(-45deg, transparent 75%, rgb(64 64 64 / 0.9) 75%);
}

.dark .transparent-preview__label {
  border-color: rgb(64 64 64 / 0.85);
  background: rgb(23 23 23 / 0.72);
  color: rgb(245 245 245 / 0.9);
}
</style>
