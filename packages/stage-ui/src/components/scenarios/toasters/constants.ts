import type { InjectionKey } from 'vue'

export const ToasterRootInjectionKey: InjectionKey<{ close: (id: string) => void }> = Symbol('ToasterRoot')
