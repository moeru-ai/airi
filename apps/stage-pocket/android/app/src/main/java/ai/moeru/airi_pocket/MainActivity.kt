package ai.moeru.airi_pocket

import android.net.Uri
import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.webkit.WebView
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebViewClient
import com.getcapacitor.Logger

class MainActivity : BridgeActivity() {

    override fun load() {
        super.load()

        val bridge = bridge ?: return
        if (!bridge.isDevMode) {
            return
        }

        bridge.setWebViewClient(DebugTlsBypassWebViewClient(bridge))
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
