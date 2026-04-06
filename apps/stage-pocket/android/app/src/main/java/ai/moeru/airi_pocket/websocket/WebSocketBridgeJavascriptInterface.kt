package ai.moeru.airi_pocket.websocket

import android.webkit.JavascriptInterface

class WebSocketBridgeJavascriptInterface(
    private val bridge: HostWebSocketBridge,
) {
    @JavascriptInterface
    fun postMessage(payload: String) {
        bridge.handleCommand(payload)
    }
}
