import type { InjectionKey, ShallowRef } from 'vue'

export const chatScrollContainerKey = Symbol('chat-scroll-container') as InjectionKey<Readonly<ShallowRef<HTMLDivElement | null>>>
