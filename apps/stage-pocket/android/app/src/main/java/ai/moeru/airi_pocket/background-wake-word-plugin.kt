package ai.moeru.airi_pocket

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray

/** Controls the native listener and hands notification hits to the WebView. */
@CapacitorPlugin(name = "BackgroundWakeWord")
class BackgroundWakeWordPlugin : Plugin() {
    companion object {
        private var activePlugin: BackgroundWakeWordPlugin? = null

        internal fun onNotificationTap() {
            activePlugin?.notifyListeners("wakeNotificationTapped", JSObject())
        }
    }

    override fun load() {
        super.load()
        activePlugin = this
    }

    override fun handleOnDestroy() {
        if (activePlugin === this) activePlugin = null
        super.handleOnDestroy()
    }

    /** Starts a microphone foreground service while Pocket is visible. */
    @PluginMethod
    fun start(call: PluginCall) {
        if (!MainActivity.isVisible) {
            call.reject("Open Pocket before starting background wake word detection")
            return
        }
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Microphone permission is required")
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            call.reject("Notification permission is required for background wake words")
            return
        }

        val notificationText = call.getObject("notificationText")
        if (notificationText == null) {
            call.reject("Notification text is required")
            return
        }
        try {
            parseNotificationText(notificationText)
        } catch (error: Exception) {
            call.reject("Invalid notification text", error)
            return
        }

        val raw = call.getArray("keywords") ?: JSONArray()
        val keywords = try {
            parseKeywords(raw)
        } catch (error: Exception) {
            call.reject("Invalid wake word list", error)
            return
        }
        if (keywords.isEmpty()) {
            call.reject("At least one active wake word is required")
            return
        }

        val validTokens = try {
            context.assets.open("kws-zh-en-3m/tokens.txt").bufferedReader().use { reader ->
                reader.lineSequence().map { it.substringBeforeLast(' ') }.toSet()
            }
        } catch (error: Exception) {
            call.reject("The bundled wake word model is unavailable", error)
            return
        }
        if (keywords.any { phrase ->
                phrase.characterId.isBlank() || phrase.tokens.isEmpty() ||
                    phrase.tokens.any { token -> token !in validTokens } ||
                    (phrase.score != null && (!phrase.score.isFinite() || phrase.score <= 0f)) ||
                    (phrase.threshold != null && (!phrase.threshold.isFinite() || phrase.threshold <= 0f || phrase.threshold > 1f))
            }
        ) {
            call.reject("Wake word tokens are not in the bundled model")
            return
        }

        val intent = Intent(context, BackgroundWakeWordService::class.java).apply {
            action = BackgroundWakeWordService.ACTION_CONFIGURE
            putExtra(BackgroundWakeWordService.EXTRA_KEYWORDS, raw.toString())
            putExtra(BackgroundWakeWordService.EXTRA_NOTIFICATION_TEXT, notificationText.toString())
        }
        try {
            ContextCompat.startForegroundService(context, intent)
            call.resolve()
        } catch (error: Exception) {
            call.reject("Cannot start background wake word detection", error)
        }
    }

    /** Completes only after native capture releases its microphone on foreground handoff. */
    @PluginMethod
    fun setForegroundCapture(call: PluginCall) {
        val active = call.getBoolean("active")
        if (active == null) {
            call.reject("Foreground capture state is required")
            return
        }
        BackgroundWakeWordService.setWebViewCaptureActive(active) { call.resolve() }
    }

    /** Stops capture before clearing pending notification state. */
    @PluginMethod
    fun stop(call: PluginCall) {
        val finish = {
            context.stopService(Intent(context, BackgroundWakeWordService::class.java))
            synchronized(BackgroundWakeWordService.pendingLock) {
                context.getSharedPreferences(BackgroundWakeWordService.PREFERENCES, 0).edit()
                    .remove(BackgroundWakeWordService.PENDING_WAKE_ID)
                    .remove(BackgroundWakeWordService.PENDING_CHARACTER_ID)
                    .remove(BackgroundWakeWordService.PENDING_TOKENS)
                    .remove(BackgroundWakeWordService.NOTIFICATION_TAPPED)
                    .apply()
            }
            (context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as NotificationManager).apply {
                cancel(BackgroundWakeWordService.MATCH_NOTIFICATION_ID)
                cancel(BackgroundWakeWordService.ERROR_NOTIFICATION_ID)
            }
            call.resolve()
        }
        val service = BackgroundWakeWordService.instance
        if (service == null) finish() else service.stopAndRelease(finish)
    }

    /** Reads a tapped notification without consuming it before foreground preparation succeeds. */
    @PluginMethod
    fun peekPendingWake(call: PluginCall) {
        val result = JSObject()
        synchronized(BackgroundWakeWordService.pendingLock) {
            val preferences = context.getSharedPreferences(BackgroundWakeWordService.PREFERENCES, 0)
            val id = preferences.getString(BackgroundWakeWordService.PENDING_WAKE_ID, null)
            val characterId = preferences.getString(BackgroundWakeWordService.PENDING_CHARACTER_ID, null)
            if (id != null && characterId != null) {
                result.put("id", id)
                result.put("characterId", characterId)
                result.put("tapped", preferences.getBoolean(BackgroundWakeWordService.NOTIFICATION_TAPPED, false))
            }
        }
        call.resolve(result)
    }

    /** A successful foreground arm confirms exactly the notification that it consumed. */
    @PluginMethod
    fun acknowledgeWake(call: PluginCall) {
        val id = call.getString("id")
        val consumed = call.getBoolean("consumed")
        if (id == null || consumed == null) {
            call.reject("A wake notification ID and consumption state are required")
            return
        }
        val cleared = synchronized(BackgroundWakeWordService.pendingLock) {
            val preferences = context.getSharedPreferences(BackgroundWakeWordService.PREFERENCES, 0)
            val tapped = preferences.getBoolean(BackgroundWakeWordService.NOTIFICATION_TAPPED, false)
            // A tap that arrives after an ordinary foreground read must remain available for capture.
            if (preferences.getString(BackgroundWakeWordService.PENDING_WAKE_ID, null) != id || (!consumed && tapped)) {
                false
            } else {
                preferences.edit()
                    .remove(BackgroundWakeWordService.PENDING_WAKE_ID)
                    .remove(BackgroundWakeWordService.PENDING_CHARACTER_ID)
                    .remove(BackgroundWakeWordService.PENDING_TOKENS)
                    .remove(BackgroundWakeWordService.NOTIFICATION_TAPPED)
                    .apply()
                true
            }
        }
        if (cleared) {
            (context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as NotificationManager)
                .cancel(BackgroundWakeWordService.MATCH_NOTIFICATION_ID)
            BackgroundWakeWordService.instance?.clearPendingMatch()
        }
        call.resolve()
    }
}
