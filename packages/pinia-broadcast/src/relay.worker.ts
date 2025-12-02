// Shared worker relay that forwards messages between connected ports.

// Synthetic `self` for SharedWorkerGlobalScope.
declare const self: SharedWorkerGlobalScope
const ports = new Set<MessagePort>()

self.onconnect = (event) => {
  const port = event.ports[0]
  ports.add(port)
  port.start()

  port.onmessage = (messageEvent) => {
    for (const target of ports) {
      if (target === port)
        continue
      try {
        target.postMessage(messageEvent.data)
      }
      catch {}
    }
  }

  const remove = () => ports.delete(port)
  port.addEventListener('close', remove)
  port.addEventListener('error', remove)
}

export {}
