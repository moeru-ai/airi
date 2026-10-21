import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers/worker'

import { closeSileroVad, scoreSileroVadWindow } from './silero-vad-events'
import { SileroVadModel } from './silero-vad-model'

// The model starts to load when the Worker starts, so the first window waits only for the rest of the load.
const model = new SileroVadModel()
const { context } = createContext()

// An abort from the main thread reaches the handler as its abort controller. The model then skips the window.
defineInvokeHandler(context, scoreSileroVadWindow, ({ samples, reset }, options) => model.score(samples, reset, options?.abortController?.signal))
defineInvokeHandler(context, closeSileroVad, () => model.close())
