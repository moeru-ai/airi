<script setup lang="ts">
// Empty placeholder. The route below redirects /auth/ to /auth/profile so a
// directly-typed `/auth/` URL or a post-sign-in callback that fell back to
// the auth-UI root lands on a usable page instead of an empty RouterView.
</script>

<template>
  <div />
</template>

<route lang="yaml">
redirect: /profile
</route>
