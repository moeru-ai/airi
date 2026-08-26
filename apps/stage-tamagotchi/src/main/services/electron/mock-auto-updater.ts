import { EventEmitter } from 'node:events'

import { app } from 'electron'

export class MockAutoUpdater extends EventEmitter {
  autoDownload = false

  async checkForUpdates() {
    this.emit('checking-for-update')

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500))

    // Simulate update available
    // We can toggle this based on some logic if needed, but for now let's assume update is always available in mock
    const updateInfo = {
      files: [],
      path: 'mock-path',
      releaseDate: new Date().toISOString(),
      releaseNotes: '## Mock Update\n\nThis is a simulated update for testing purposes.\n\n- Feature A\n- Bugfix B',
      sha512: 'mock-sha',
      version: '9.9.9-mock',
    }

    this.emit('update-available', updateInfo)

    // In real updater, if autoDownload is true, it starts downloading.
    // We'll respect that if we were fully mocking, but typically we trigger download manually in this app.
    return { updateInfo }
  }

  async downloadUpdate() {
    // Simulate download progress
    const total = 100 * 1024 * 1024 // 100MB
    let transferred = 0
    const speed = 5 * 1024 * 1024 // 5MB/s simulation

    const interval = setInterval(() => {
      transferred += speed / 10 // Update every 100ms
      if (transferred > total)
        transferred = total

      const progress = {
        bytesPerSecond: speed,
        percent: (transferred / total) * 100,
        total,
        transferred,
      }

      this.emit('download-progress', progress)

      if (transferred >= total) {
        clearInterval(interval)
        this.emit('update-downloaded', {
          files: [],
          path: 'mock-path',
          releaseDate: new Date().toISOString(),
          releaseNotes: '## Mock Update\n\nThis is a simulated update for testing purposes.\n\n- Feature A\n- Bugfix B',
          sha512: 'mock-sha',
          version: '9.9.9-mock',
        })
      }
    }, 100)
  }

  async quitAndInstall() {
    // eslint-disable-next-line no-console
    console.log('[MockAutoUpdater] quitAndInstall called. Quitting app...')
    app.quit()
  }
}
