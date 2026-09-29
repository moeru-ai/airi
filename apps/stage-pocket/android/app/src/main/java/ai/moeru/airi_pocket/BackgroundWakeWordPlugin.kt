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
        }
        try {
            ContextCompat.startForegroundService(context, intent)
            call.resolve()
        } catch (error: Exception) {
            call.reject("Cannot start background wake word detection", error)
        }
    }

    /** Stops the native listener and releases its microphone. */
    @PluginMethod
    fun stop(call: PluginCall) {
        context.stopService(Intent(context, BackgroundWakeWordService::class.java))
        context.getSharedPreferences(BackgroundWakeWordService.PREFERENCES, 0).edit()
            .remove(BackgroundWakeWordService.PENDING_CHARACTER_ID)
            .remove(BackgroundWakeWordService.PENDING_TOKENS)
            .remove(BackgroundWakeWordService.NOTIFICATION_TAPPED)
            .apply()
        (context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as NotificationManager).apply {
            cancel(BackgroundWakeWordService.MATCH_NOTIFICATION_ID)
            cancel(BackgroundWakeWordService.ERROR_NOTIFICATION_ID)
        }
        call.resolve()
    }

    /** Claims one hit. Pocket then opens a single foreground speech window. */
    @PluginMethod
    fun takePendingWake(call: PluginCall) {
        val preferences = context.getSharedPreferences(BackgroundWakeWordService.PREFERENCES, 0)
        val tapped = preferences.getBoolean(BackgroundWakeWordService.NOTIFICATION_TAPPED, false)
        val characterId = if (tapped) preferences.getString(BackgroundWakeWordService.PENDING_CHARACTER_ID, null) else null
        val tokens = preferences.getString(BackgroundWakeWordService.PENDING_TOKENS, null)
        val result = JSObject()
        if (characterId != null) {
            result.put("characterId", characterId)
            result.put("tokens", if (tokens != null) JSONArray(tokens) else JSONArray())
            preferences.edit()
                .remove(BackgroundWakeWordService.PENDING_CHARACTER_ID)
                .remove(BackgroundWakeWordService.PENDING_TOKENS)
                .remove(BackgroundWakeWordService.NOTIFICATION_TAPPED)
                .apply()
            BackgroundWakeWordService.instance?.clearPendingMatch()
        }
        call.resolve(result)
    }
}
