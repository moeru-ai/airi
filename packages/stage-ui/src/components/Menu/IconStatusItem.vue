<script setup lang="ts">
const props = defineProps<{
  title: string
  description?: string
  icon?: string
  iconColor?: string
  iconImage?: string
  to: string
  configured?: boolean
}>()
</script>

<template>
  <div
    flex="~ col"
    bg="neutral-50 dark:neutral-800"
    border="neutral-100 dark:neutral-800/25 hover:primary-500/30 dark:hover:primary-400/30 solid 2"
    drop-shadow="none hover:[0px_4px_4px_rgba(220,220,220,0.4)] active:[0px_0px_0px_rgba(220,220,220,0.25)] dark:hover:none"
    class="menu-icon-status-item"
    transition="all ease-in-out duration-400"
    w-full cursor-pointer of-hidden rounded-xl
  >
    <RouterLink
      flex="~ row"
      class="menu-icon-status-item-link"
      bg="white dark:neutral-900"
      transition="all ease-in-out duration-400"
      relative h-full w-full items-center overflow-hidden rounded-lg p-5 text-left
      :to=" props.to"
    >
      <div z-1 flex-1>
        <div
          text-lg font-normal
          class="menu-icon-status-item-title"
          transition="all ease-in-out duration-400"
        >
          {{ props.title }}
        </div>
        <div
          text="sm neutral-500 dark:neutral-400"
          class="menu-icon-status-item-description"
          transition="all ease-in-out duration-400"
        >
          <span>{{ props.description || '' }}</span>
        </div>
      </div>
      <template v-if=" props.icon">
        <div
          class="menu-icon-status-item-icon"
          transition="all ease-in-out duration-400"
          absolute right-0 size-16 translate-y-2
          text="neutral-400/50 dark:neutral-600/50"
          grayscale-100
          :class="[props.icon]"
        />
      </template>
      <template v-if=" props.iconColor">
        <div
          class="menu-icon-status-item-icon-color"
          transition="all ease-in-out duration-400"
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
          transition="all ease-in-out duration-400"
          absolute right-0 size-16 translate-y-2
          grayscale-100
        >
      </template>
    </RouterLink>
    <div p-2>
      <div v-if="!!props.configured" size-3 bg="green-500 dark:green-600" rounded-full />
      <div v-else size-3 bg="neutral-400 dark:neutral-500" rounded-full />
    </div>
  </div>
</template>

<style scoped>
.menu-icon-status-item {
  position: relative;
  overflow: hidden;
}

.menu-icon-status-item::before {
  --at-apply: 'bg-gradient-to-r from-primary-500/0 to-primary-500/0 dark:from-primary-400/0 dark:to-primary-400/0';
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 25%;
  height: 100%;
  transition: all 0.4s ease-in-out;
  mask-image: linear-gradient(120deg, white 100%);
  opacity: 0;
}

.menu-icon-status-item:hover::before,
.menu-icon-status-item._hover::before {
  --at-apply: 'bg-gradient-to-r from-primary-500/20 via-primary-500/10 to-transparent dark:from-primary-400/20 dark:via-primary-400/10 dark:to-transparent';
  width: 50%;
  opacity: 1;
}

.menu-icon-status-item-link::after {
  --at-apply: 'bg-dotted-[neutral-200/80] hover:bg-dotted-[primary-300/50] dark:bg-dotted-[neutral-700/40] dark:hover:bg-dotted-[primary-200/20]';
  position: absolute;
  inset: 0;
  z-index: -2;
  width: 100%;
  height: 100%;
  background-size: 10px 10px;
  content: '';
  mask-image: linear-gradient(165deg, white 30%, transparent 50%);
  transition: all 0.4s ease-in-out;
}

.menu-icon-status-item-icon-color {
  opacity: 0.5;
}

.menu-icon-status-item:hover .menu-icon-status-item-title,
.menu-icon-status-item._hover .menu-icon-status-item-title {
  --at-apply: text-primary-600;
}

.menu-icon-status-item:hover .menu-icon-status-item-description,
.menu-icon-status-item._hover .menu-icon-status-item-description {
  --at-apply: text-primary-600;
  opacity: 0.8;
}

.menu-icon-status-item:hover .menu-icon-status-item-icon,
.menu-icon-status-item._hover .menu-icon-status-item-icon,
.menu-icon-status-item:hover .menu-icon-status-item-icon-color,
.menu-icon-status-item._hover .menu-icon-status-item-icon-color {
  --at-apply: text-primary-500;
  scale: 1.2;
}

.dark .menu-icon-status-item:hover .menu-icon-status-item-title,
.dark .menu-icon-status-item._hover .menu-icon-status-item-title {
  --at-apply: text-primary-300;
}

.dark .menu-icon-status-item:hover .menu-icon-status-item-description,
.dark .menu-icon-status-item._hover .menu-icon-status-item-description {
  --at-apply: text-primary-300;
  opacity: 0.8;
}

.dark .menu-icon-status-item:hover .menu-icon-status-item-icon,
.dark .menu-icon-status-item._hover .menu-icon-status-item-icon,
.dark .menu-icon-status-item:hover .menu-icon-status-item-icon-color,
.dark .menu-icon-status-item._hover .menu-icon-status-item-icon-color {
  --at-apply: text-primary-400;
}
</style>
