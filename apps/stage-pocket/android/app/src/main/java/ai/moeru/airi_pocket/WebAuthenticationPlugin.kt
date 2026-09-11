package ai.moeru.airi_pocket

import android.content.Intent
import android.net.Uri
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WebAuthentication")
class WebAuthenticationPlugin : Plugin() {
    /** Opens the authorization URL in the default system browser. */
    @PluginMethod
    fun authenticate(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("The authentication URL is missing.", "INVALID_URL")
            return
        }

        val uri = runCatching { Uri.parse(url) }.getOrNull()
        if (uri?.scheme !in setOf("http", "https")) {
            call.reject("The authentication URL is invalid.", "INVALID_URL")
            return
        }

        val intent = Intent(Intent.ACTION_VIEW, uri)
        try {
            activity.startActivity(intent)
            call.resolve()
        } catch (error: RuntimeException) {
            call.reject("No browser can open the authentication URL.", "BROWSER_UNAVAILABLE", error)
        }
    }
}
