import { setupCuippBridge } from './cuipp'

/**
 * LIVE GENERATION TEST HARNESS FOR CUIPP BRIDGE
 * This script performs a REAL generation call to verify the full GPU pipeline.
 */

const mockManager: any = {
  updateWidget: async (_payload: any) => {
    // This will be replaced by setupCuippBridge
    console.log('[Mock] Original updateWidget called')
  },
  getWidgetSnapshot: (id: string) => {
    return { id, componentName: 'comfy' }
  },
  emit: (event: any, payload: any) => {
    const eventKey = event?.key || event
    if (payload.componentProps?.imageUrl) {
      console.log(`[Mock] 🖼️  IMAGE DETECTED: ${payload.componentProps.imageUrl}`)
    }
    else if (payload.componentProps?.progress !== undefined) {
      console.log(`[Mock] ⏳ Progress: ${payload.componentProps.progress}% - ${payload.componentProps.actionLabel || ''}`)
    }
    else {
      console.log(`[Mock] IPC Emit [${eventKey}]:`, JSON.stringify(payload, null, 2))
    }
  },
}

console.log('--- Starting CUIPP Live Generation Test ---')
setupCuippBridge({ widgetsManager: mockManager })

async function runTest() {
  console.log('\n--- LIVE TEST: Triggering GPU Generation (Stringified Props) ---')
  console.log('[Test] Mimicking AIRI behavior: Sending componentProps as a RAW STRING.')

  const completionPromise = new Promise((resolve, reject) => {
    const originalEmit = mockManager.emit
    mockManager.emit = (event: any, payload: any) => {
      originalEmit(event, payload)
      console.log(`[Test] IPC Emit [${event?.key || event}]:`, JSON.stringify(payload, null, 2))
      if (payload.componentProps?.imageUrl || payload.componentProps?.status === 'error') {
        resolve(payload)
      }
    }
    setTimeout(() => reject(new Error('Generation timed out')), 180000)
  })

  // Mimic AIRI: Stringified JSON in componentProps
  await mockManager.updateWidget({
    id: 'airi-canvas',
    componentProps: JSON.stringify({
      status: 'generating',
      prompt: 'a small robust robot fixing a circuit',
    }),
  })

  console.log('[Test] Waiting for GPU output...')
  try {
    const result: any = await completionPromise
    console.log('[Test] Received final payload:', JSON.stringify(result, null, 2))
    if (result.componentProps?.imageUrl) {
      console.log('\n--- SUCCESS ---')
      console.log('[Test] Constructured URL:', result.componentProps.imageUrl)
    }
  }
  catch (err) {
    console.error('\n--- TEST ERROR ---')
    console.error(err)
  }
}

runTest().catch(console.error)
