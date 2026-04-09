package ai.moeru.airi_pocket

import android.net.Uri
import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.webkit.WebView
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebViewClient
import com.getcapacitor.Logger
import org.json.JSONObject

import ai.moeru.airi_pocket.websocket.HostWebSocketBridge
import ai.moeru.airi_pocket.websocket.HostWebSocketEvent
import ai.moeru.airi_pocket.websocket.HostWebSocketSession
import ai.moeru.airi_pocket.websocket.OkHttpHostWebSocketSessionFactory
import ai.moeru.airi_pocket.websocket.WebSocketBridgeJavascriptInterface
import ai.moeru.airi_pocket.websocket.createHostWebSocketClient

class MainActivity : BridgeActivity() {
    companion object {
        internal var webSocketSessionFactoryOverrideForTesting: ((String, (HostWebSocketEvent) -> Unit) -> HostWebSocketSession)? = null
    }

    private val webSocketBridgeClient = createHostWebSocketClient()
    private var webSocketBridge: HostWebSocketBridge? = null

    override fun load() {
        super.load()

        val bridge = bridge ?: return
        installWebSocketBridge(bridge)

        if (!bridge.isDevMode) {
            return
        }

        bridge.setWebViewClient(DebugTlsBypassWebViewClient(bridge))
    }

    override fun onDestroy() {
        webSocketBridge?.dispose()
        super.onDestroy()
    }

    internal fun evaluateJavascriptForTesting(script: String, callback: (String?) -> Unit) {
        bridge?.webView?.let { webView ->
            webView.post {
                webView.evaluateJavascript(script, callback)
            }
        } ?: callback(null)
    }

    private fun installWebSocketBridge(bridge: Bridge) {
        val hostWebSocketBridge = HostWebSocketBridge(
            sessionFactory = webSocketSessionFactoryOverrideForTesting
                ?: OkHttpHostWebSocketSessionFactory(webSocketBridgeClient)::create,
            eventSink = ::dispatchWebSocketBridgeEvent,
        )
        webSocketBridge = hostWebSocketBridge

        bridge.webView.addJavascriptInterface(
            WebSocketBridgeJavascriptInterface(hostWebSocketBridge),
            "AiriHostBridge",
        )
    }

    private fun dispatchWebSocketBridgeEvent(payload: String) {
        val webView = bridge?.webView ?: return
        webView.post {
            webView.evaluateJavascript(
                "window.__airiHostBridge?.onNativeMessage(${JSONObject.quote(payload)})",
                null,
            )
        }
    }

    private class DebugTlsBypassWebViewClient(
        private val bridge: Bridge,
    ) : BridgeWebViewClient(bridge) {

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            if (shouldBypassDevServerCertificate(error)) {
                Logger.warn("Bypassing TLS certificate validation for debug dev server: ${error.url}")
                handler.proceed()
                return
            }

            super.onReceivedSslError(view, handler, error)
        }

        // NOTICE: Android WebView rejects the self-signed HTTPS cert used by the debug dev server.
        // Keep this bypass debug-only and scoped to the configured dev server origin.
        private fun shouldBypassDevServerCertificate(error: SslError?): Boolean {
            val serverUrl = bridge.serverUrl?.takeUnless(String::isEmpty) ?: return false
            val errorUrl = error?.url?.takeUnless(String::isEmpty) ?: return false

            val serverUri = Uri.parse(serverUrl)
            if (!serverUri.scheme.equals("https", ignoreCase = true)) {
                return false
            }

            val errorUri = Uri.parse(errorUrl)
            return serverUri.host.equals(errorUri.host, ignoreCase = true)
                && normalizePort(serverUri) == normalizePort(errorUri)
        }

        private fun normalizePort(uri: Uri): Int =
            uri.port.takeUnless { it == -1 }
                ?: when (uri.scheme?.lowercase()) {
                    "https" -> 443
                    "http" -> 80
                    else -> -1
                }
    }
}
