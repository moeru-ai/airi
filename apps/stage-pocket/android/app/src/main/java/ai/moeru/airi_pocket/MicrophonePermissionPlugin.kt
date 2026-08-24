package ai.moeru.airi_pocket

import android.Manifest
import android.content.pm.PackageManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "MicrophonePermission")
class MicrophonePermissionPlugin : Plugin() {
    /** Reports native permission state without opening Android's permission dialog. */
    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val permission = Manifest.permission.RECORD_AUDIO
        val result = JSObject().apply {
            put("granted", context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED)
        }
        call.resolve(result)
    }
}
