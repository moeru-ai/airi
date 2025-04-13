import type { WasmModule } from '../libs/vad'

export async function loadWasmModule(wasmUrl: string): Promise<WasmModule> {
  return new Promise<WasmModule>((resolve, reject) => {
    // Create a script element to load the WASM module
    const script = document.createElement('script')
    script.src = wasmUrl
    script.async = true

    script.onload = () => {
      // Access the global Module object
      const Module = (window as any).Module

      if (!Module) {
        reject(new Error('Failed to load WASM module: Module not found'))
        return
      }

      if (Module.onRuntimeInitialized) {
        const originalOnRuntimeInitialized = Module.onRuntimeInitialized
        Module.onRuntimeInitialized = () => {
          if (originalOnRuntimeInitialized) {
            originalOnRuntimeInitialized()
          }
          resolve(Module)
        }
      }
      else {
        // Module is already initialized
        resolve(Module)
      }
    }

    script.onerror = () => {
      reject(new Error('Failed to load WASM module'))
    }

    document.head.appendChild(script)
  })
}
