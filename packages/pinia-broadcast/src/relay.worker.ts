// Shared worker relay that forwards messages between connected ports.
const ports = new Set<MessagePort>()

onconnect = (event: MessageEvent) => {
  const port = event.ports[0]
  ports.add(port)
  port.start()

  port.onmessage = (messageEvent: MessageEvent) => {
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
