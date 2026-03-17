import { defineInvokeEventa } from '@moeru/eventa'

export type MicToggleHotkey = 'Scroll' | 'Caps' | 'Num'

export const electronGetMicToggleHotkey = defineInvokeEventa<MicToggleHotkey>('eventa:invoke:electron:shortcuts:mic-toggle:get-hotkey')
export const electronSetMicToggleHotkey = defineInvokeEventa<void, MicToggleHotkey>('eventa:invoke:electron:shortcuts:mic-toggle:set-hotkey')
