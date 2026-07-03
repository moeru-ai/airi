import { EventEmitter } from 'node:events'

import { app } from 'electron'

export class MockAutoUpdater extends EventEmitter {
  autoDownload = false
  allowPrerelease = false
  channel: string | undefined
  forceDevUpdateConfig = false
  logger:
    | {
        info: (message: string) => void
        warn: (message: string) => void
        error: (message: string) => void
        debug: (message: string) => void
      }
    | undefined

  override on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener)
  }

  setFeedURL(_options: { provider: 'generic'; url: string }): void {
    // No-op in mock
  }

  async checkForUpdates() {
    this.emit('checking-for-update')

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Simulate update available
    // We can toggle this based on some logic if needed, but for now let's assume update is always available in mock
    const updateInfo = {
      version: '9.9.9-mock',
      files: [],
      path: 'mock-path',
      sha512: 'mock-sha',
      releaseDate: new Date().toISOString(),
      releaseNotes: '## Mock Update\n\nThis is a simulated update for testing purposes.\n\n- Feature A\n- Bugfix B',
    }

    this.emit('update-available', updateInfo)

    // In real updater, if autoDownload is true, it starts downloading.
    // We'll respect that if we were fully mocking, but typically we trigger download manually in this app.
    return { updateInfo }
  }

  downloadUpdate(): Promise<unknown> {
    // Simulate download progress
    const total = 100 * 1024 * 1024 // 100MB
    let transferred = 0
    const speed = 5 * 1024 * 1024 // 5MB/s simulation

    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        transferred += speed / 10 // Update every 100ms
        if (transferred > total) transferred = total

        const progress = {
          total,
          transferred,
          percent: (transferred / total) * 100,
          bytesPerSecond: speed,
        }

        this.emit('download-progress', progress)

        if (transferred >= total) {
          clearInterval(interval)
          this.emit('update-downloaded', {
            version: '9.9.9-mock',
            files: [],
            path: 'mock-path',
            sha512: 'mock-sha',
            releaseDate: new Date().toISOString(),
            releaseNotes:
              '## Mock Update\n\nThis is a simulated update for testing purposes.\n\n- Feature A\n- Bugfix B',
          })
          resolve()
        }
      }, 100)
    })
  }

  quitAndInstall() {
    app.quit()
  }
}
