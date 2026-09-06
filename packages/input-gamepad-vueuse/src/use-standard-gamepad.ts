import type {
  GamepadFamily,
  StandardGamepadButtonName,
  StandardGamepadMonitorOptions,
  StandardGamepadSnapshot,
  StandardGamepadStickState,
} from '@proj-airi/input-gamepad'
import type { ComputedRef, DeepReadonly, ShallowRef } from 'vue'

import {
  isGamepadApiSupported,
  standardGamepadButtonNames,
  StandardGamepadMonitor,
} from '@proj-airi/input-gamepad'
import { tryOnMounted, tryOnScopeDispose } from '@vueuse/core'
import { computed, readonly, shallowRef } from 'vue'

const neutralStick: StandardGamepadStickState = Object.freeze({ x: 0, y: 0 })

/** Reactive pressed states for all standard gamepad buttons. */
export type StandardGamepadButtonRefs = Readonly<Record<StandardGamepadButtonName, ComputedRef<boolean>>>

/** Reactive analog values for all standard gamepad buttons. */
export type StandardGamepadValueRefs = Readonly<Record<StandardGamepadButtonName, ComputedRef<number>>>

/** Reactive state and lifecycle controls for one selected standard gamepad. */
export interface UseStandardGamepadReturn {
  /** True when the selected gamepad is connected. */
  readonly isConnected: ComputedRef<boolean>
  /** True while the composable owns a polling loop. */
  readonly isActive: DeepReadonly<ShallowRef<boolean>>
  /** True when the Gamepad API or an injected reader is available. */
  readonly isSupported: ComputedRef<boolean>
  /** The controller family used for printed button labels. */
  readonly family: ComputedRef<GamepadFamily>
  /** The latest normalized state. */
  readonly snapshot: DeepReadonly<ShallowRef<StandardGamepadSnapshot | undefined>>
  /** Digital pressed states by physical button position. */
  readonly buttons: StandardGamepadButtonRefs
  /** Analog values by physical button position. */
  readonly values: StandardGamepadValueRefs
  /** Normalized thumbstick positions. */
  readonly sticks: Readonly<{
    left: ComputedRef<StandardGamepadStickState>
    right: ComputedRef<StandardGamepadStickState>
  }>
  /** Pauses the polling loop. The latest snapshot remains available. */
  readonly pause: () => void
  /** Returns a reactive state that is true while all specified buttons are pressed. */
  readonly pressed: (...buttons: StandardGamepadButtonName[]) => ComputedRef<boolean>
  /** Starts the polling loop when the Gamepad API is available. */
  readonly resume: () => void
}

/**
 * Provides reactive state for one browser gamepad with the W3C standard mapping.
 *
 * The composable owns its monitor until the current Vue scope is disposed.
 * Use the dependency options only for an alternate browser runtime or a test adapter.
 */
export function useStandardGamepad(options?: StandardGamepadMonitorOptions): UseStandardGamepadReturn {
  const snapshot = shallowRef<StandardGamepadSnapshot>()
  const isActive = shallowRef(false)
  const monitor = new StandardGamepadMonitor(options)
  const stopListening = monitor.onSnapshot((nextSnapshot) => {
    snapshot.value = nextSnapshot
  })

  const isSupported = computed(() => options?.getGamepads !== undefined || isGamepadApiSupported())
  const isConnected = computed(() => snapshot.value !== undefined)
  const family = computed(() => snapshot.value?.family ?? 'unknown')
  const buttons = createButtonRefs(snapshot)
  const values = createValueRefs(snapshot)
  const sticks = Object.freeze({
    left: computed(() => snapshot.value?.leftStick ?? neutralStick),
    right: computed(() => snapshot.value?.rightStick ?? neutralStick),
  })

  function pause(): void {
    if (!isActive.value)
      return

    monitor.stop()
    isActive.value = false
  }

  function resume(): void {
    if (!isSupported.value || isActive.value)
      return

    monitor.start()
    isActive.value = true
  }

  function pressed(...buttonNames: StandardGamepadButtonName[]): ComputedRef<boolean> {
    return computed(() => buttonNames.length > 0 && buttonNames.every(name => buttons[name].value))
  }

  tryOnMounted(resume)
  tryOnScopeDispose(() => {
    stopListening()
    pause()
  })

  return {
    buttons,
    family,
    isActive: readonly(isActive),
    isConnected,
    isSupported,
    pause,
    pressed,
    resume,
    snapshot: readonly(snapshot),
    sticks,
    values,
  }
}

function createButtonRefs(
  snapshot: Readonly<ShallowRef<StandardGamepadSnapshot | undefined>>,
): StandardGamepadButtonRefs {
  return Object.freeze(Object.fromEntries(
    standardGamepadButtonNames.map(name => [name, computed(() => snapshot.value?.buttons[name].pressed ?? false)]),
  )) as StandardGamepadButtonRefs
}

function createValueRefs(
  snapshot: Readonly<ShallowRef<StandardGamepadSnapshot | undefined>>,
): StandardGamepadValueRefs {
  return Object.freeze(Object.fromEntries(
    standardGamepadButtonNames.map(name => [name, computed(() => snapshot.value?.buttons[name].value ?? 0)]),
  )) as StandardGamepadValueRefs
}
