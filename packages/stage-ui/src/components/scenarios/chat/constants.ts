import type { InjectionKey, Ref } from 'vue'

export const chatScrollContainerKey = Symbol('chat-scroll-container') as InjectionKey<Ref<HTMLDivElement | undefined>>
