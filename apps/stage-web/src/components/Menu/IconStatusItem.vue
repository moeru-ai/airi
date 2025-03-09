<script setup lang="ts">
const props = defineProps<{
  title: string
  description: string
  icon?: string
  iconColor?: string
  iconImage?: string
  to: string
  configured: boolean
}>()
</script>

<template>
  <div
    flex="~ col"
    bg="neutral-200/50 dark:neutral-700"
    border="neutral-100 dark:neutral-700 hover:primary-500 dark:hover:primary-400 solid 2"
    drop-shadow="none hover:[0px_4px_4px_rgba(220,220,220,0.4)] active:[0px_0px_0px_rgba(220,220,220,0.25)] dark:hover:none"
    class="menu-icon-status-item"
    transition="all ease-in-out duration-200"
    w-full of-hidden rounded-xl
  >
    <RouterLink
      flex="~ row"
      bg="neutral-50 dark:neutral-800"
      transition="all ease-in-out duration-200"
      relative w-full items-center overflow-hidden rounded-lg p-5 text-left
      :to=" props.to"
    >
      <div z-1 flex-1>
        <div
          text-lg font-bold
          class="menu-icon-status-item-title"
          transition="all ease-in-out duration-200"
        >
          {{ props.title }}
        </div>
        <div
          text="sm neutral-500 dark:neutral-400"
          class="menu-icon-status-item-description"
          transition="all ease-in-out duration-200"
        >
          <span>{{ props.description }}</span>
        </div>
      </div>
      <template v-if=" props.icon">
        <div
          class="menu-icon-status-item-icon"
          transition="all ease-in-out duration-500"
          absolute right-0 size-16 translate-y-2
          text="neutral-400/50 dark:neutral-600/50"
          grayscale-100
          :class="[props.icon]"
        />
      </template>
      <template v-if=" props.iconColor">
        <div
          class="menu-icon-status-item-icon-color"
          transition="all ease-in-out duration-500"
          absolute right-0 size-16 translate-y-2
          text="neutral-400/50 dark:neutral-600/50"
          grayscale-100
          :class="[props.iconColor]"
        />
      </template>
      <template v-if=" props.iconImage">
        <img
          :src=" props.iconImage"
          class="menu-icon-status-item-icon-image"
          transition="all ease-in-out duration-500"
          absolute right-0 size-16 translate-y-2
          grayscale-100
        >
      </template>
    </RouterLink>
    <div p-2>
      <div v-if=" props.configured" size-3 bg="green-500 dark:green-600" rounded-full />
      <div v-else size-3 bg="neutral-400 dark:neutral-500" rounded-full />
    </div>
  </div>
</template>

<style scoped>
.menu-icon-status-item::after {
  --at-apply: 'bg-dotted-[neutral-200] hover:bg-dotted-[primary-300/50] dark:bg-dotted-[neutral-700/80] dark:hover:bg-dotted-[primary-200/20]';
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  background-size: 10px 10px;
  content: '';
  mask-image: linear-gradient(165deg, white 30%, transparent 50%);
}

.menu-icon-status-item:hover .menu-icon-status-item-title {
  --at-apply: text-primary-500;
}

.menu-icon-status-item:hover .menu-icon-status-item-description {
  --at-apply: text-primary-500;
  opacity: 0.8;
}

.menu-icon-status-item:hover .menu-icon-status-item-icon {
  --at-apply: text-primary-500;
  scale: 1.2;
  opacity: 0.2;
  filter: grayscale(0);
}

.menu-icon-status-item:hover .menu-icon-status-item-icon-color {
  scale: 1.2;
  filter: grayscale(0);
}

.menu-icon-status-item:hover .menu-icon-status-item-icon-image {
  scale: 1.2;
  filter: grayscale(0);
}

.dark .menu-icon-status-item:hover .menu-icon-status-item-title {
  --at-apply: text-primary-400;
}

.dark .menu-icon-status-item:hover .menu-icon-status-item-description {
  --at-apply: text-primary-400;
  opacity: 0.8;
}

.dark .menu-icon-status-item:hover .menu-icon-status-item-icon {
  --at-apply: text-primary-400;
  opacity: 0.2;
}
</style>
