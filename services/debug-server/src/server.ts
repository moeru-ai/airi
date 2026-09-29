interface ClosableServer {
  close: (callback: (error?: Error) => void) => unknown
  closeAllConnections?: () => void
}

export async function closeHttpServer(server: ClosableServer, graceMillis = 5000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => server.closeAllConnections?.(), graceMillis)
    server.close((error) => {
      clearTimeout(timer)
      if (error)
        reject(error)
      else
        resolve()
    })
  })
}
