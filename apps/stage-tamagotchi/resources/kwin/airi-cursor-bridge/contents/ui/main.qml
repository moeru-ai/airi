import QtQuick
import QtWebSockets
import org.kde.kwin as KWin

QtObject {
  id: root

  property var clients: []
  property string lastSnapshot: ""

  WebSocketServer {
    id: server

    host: "127.0.0.1"
    port: 6181
    listen: true

    onClientConnected: function (client) {
      root.lastSnapshot = ""
      root.clients = root.clients.concat([client])
    }
  }

  Timer {
    interval: 16
    repeat: true
    running: true

    onTriggered: root.publishSnapshot()
  }

  Timer {
    interval: 500
    repeat: true
    running: true

    onTriggered: root.publishSnapshot(true)
  }

  function publishSnapshot(heartbeat = false) {
    if (root.clients.length === 0)
      return

    const cursor = KWin.Workspace.cursorPos
    const windows = KWin.Workspace.windowList()
      .filter(window => window.desktopFileName.toLowerCase() === "ai.moeru.airi" || window.resourceClass.toLowerCase() === "ai-moeru-airi")
      .map((window) => {
        const geometry = window.clientGeometry
        return {
          title: window.caption,
          bounds: {
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
          },
        }
      })
    const snapshot = JSON.stringify({
      version: 1,
      cursor: { x: cursor.x, y: cursor.y },
      windows,
    })

    if (snapshot === root.lastSnapshot && !heartbeat)
      return

    root.lastSnapshot = snapshot
    root.clients = root.clients.filter((client) => {
      if (client.status === WebSocket.Error) {
        console.warn(`AIRI cursor bridge client error: ${client.errorString}`)
        client.active = false
        return false
      }

      if (client.status !== WebSocket.Open)
        return false

      try {
        client.sendTextMessage(snapshot)
        return true
      }
      catch (error) {
        console.warn(`AIRI cursor bridge failed to send a snapshot: ${error}`)
        client.active = false
        return false
      }
    })
  }

  Component.onCompleted: {
    if (server.errorString !== "")
      console.warn(`AIRI cursor bridge failed to listen on 127.0.0.1:6181: ${server.errorString}`)
  }
}
