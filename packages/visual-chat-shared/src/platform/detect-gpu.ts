import { execFileSync } from 'node:child_process'

export function detectGpuAvailability(): boolean {
  try {
    execFileSync('nvidia-smi', ['-L'], { stdio: 'ignore' })
    return true
  }
  catch {
    return false
  }
}
