package ai.moeru.airi_pocket

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.concurrent.thread

/**
 * Detects card wake words while Pocket is in the background. The service starts
 * from a visible activity because Android grants microphone access at that point.
 * A match stores its target card and a unique notification ID. The user taps the notification before
 * Pocket opens a foreground speech window.
 */
class BackgroundWakeWordService : Service() {
    companion object {
        const val ACTION_CONFIGURE = "ai.moeru.airi_pocket.CONFIGURE_WAKE_WORDS"
        const val EXTRA_KEYWORDS = "keywords"
        const val EXTRA_NOTIFICATION_TEXT = "notification_text"
        const val PREFERENCES = "background_wake_word"
        const val PENDING_WAKE_ID = "pending_wake_id"
        internal val pendingLock = Any()
        private val captureTransitions = Executors.newSingleThreadExecutor { task -> Thread(task, "wake-word-transition") }

        @Volatile
        private var webViewCaptureActive = true

        /** Resolves after native capture releases its microphone when the WebView resumes. */
        internal fun setWebViewCaptureActive(active: Boolean, released: () -> Unit = {}) {
            webViewCaptureActive = active || MainActivity.isVisible
            val service = instance
            if (service == null) captureTransitions.execute(released) else service.restartCapture(released)
        }

        const val PENDING_CHARACTER_ID = "pending_character_id"
        const val PENDING_TOKENS = "pending_tokens"
        const val NOTIFICATION_TAPPED = "notification_tapped"
        const val EXTRA_WAKE_ID = "wake_id"
        const val ACTION_OPEN_WAKE = "ai.moeru.airi_pocket.OPEN_WAKE_WORD"

        private const val TAG = "BackgroundWakeWord"
        private const val LISTENING_CHANNEL_ID = "background_wake_word_listening"
        private const val MATCH_CHANNEL_ID = "background_wake_word_match"
        private const val LISTENING_NOTIFICATION_ID = 4101
        internal const val MATCH_NOTIFICATION_ID = 4102
        internal const val ERROR_NOTIFICATION_ID = 4103
        private const val SAMPLE_RATE = 16000
        private const val MODEL_DIR = "kws-zh-en-3m"

        @Volatile
        var instance: BackgroundWakeWordService? = null
            private set
    }

    private val lock = Any()
    private var captureThread: Thread? = null
    private var recorder: AudioRecord? = null
    private var generation = 0
    private var stopped = false
    private var appVisible = true
    private var pendingMatch = false
    private var keywords = emptyList<WakeKeyword>()
    private lateinit var notificationText: WakeNotificationText

    override fun onCreate() {
        super.onCreate()
        appVisible = MainActivity.isVisible
        instance = this
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action != ACTION_CONFIGURE) return START_NOT_STICKY

        val incoming = intent.getStringExtra(EXTRA_KEYWORDS) ?: return START_NOT_STICKY
        val incomingText = intent.getStringExtra(EXTRA_NOTIFICATION_TEXT) ?: return START_NOT_STICKY
        val parsed = parseKeywords(JSONArray(incoming))
        notificationText = parseNotificationText(JSONObject(incomingText))
        createNotificationChannel()
        if (parsed.isEmpty()) {
            stopSelf()
            return START_NOT_STICKY
        }

        synchronized(lock) {
            stopped = false
            keywords = parsed
            pendingMatch = getSharedPreferences(PREFERENCES, MODE_PRIVATE).contains(PENDING_CHARACTER_ID)
        }
        val notification = if (pendingMatch) waitingNotification() else listeningNotification()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(LISTENING_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(LISTENING_NOTIFICATION_ID, notification)
        }

        restartCapture()
        return START_NOT_STICKY
    }

    /** A visible WebView owns the microphone; the native detector resumes when it leaves. */
    fun setAppVisible(visible: Boolean) {
        synchronized(lock) { appVisible = visible }
        restartCapture()
    }

    /** Restores background detection after the WebView claims a pending wake. */
    fun clearPendingMatch() {
        synchronized(lock) { pendingMatch = false }
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .notify(LISTENING_NOTIFICATION_ID, listeningNotification())
        restartCapture()
    }

    /** Stops an old capture before any service instance can acquire the microphone again. */
    private fun restartCapture(released: () -> Unit = {}) {
        val ticket: Int
        synchronized(lock) {
            generation += 1
            ticket = generation
            recorder?.runCatching { stop() }
        }
        captureTransitions.execute {
            try {
                val previous = synchronized(lock) { captureThread }
                previous?.join()
                synchronized(lock) {
                    if (captureThread === previous) captureThread = null
                    if (ticket == generation && !stopped && !appVisible && !webViewCaptureActive && !pendingMatch && keywords.isNotEmpty()) {
                        val activeKeywords = keywords
                        captureThread = thread(name = "wake-word-capture") { capture(ticket, activeKeywords) }
                    }
                }
            } finally {
                released()
            }
        }
    }

    /** Prevents new capture and acknowledges the release before the plugin stops this service. */
    internal fun stopAndRelease(released: () -> Unit) {
        synchronized(lock) { stopped = true }
        restartCapture(released)
    }

    private fun capture(ownGeneration: Int, phrases: List<WakeKeyword>) {
        var spotter: KeywordSpotter? = null
        var microphone: AudioRecord? = null
        try {
            val model = prepareModel()
            val keywordFile = File(filesDir, "wake-word-keywords-$ownGeneration.txt")
            val tags = phrases.mapIndexed { index, phrase -> "wake_$index" to phrase }
            keywordFile.writeText(tags.joinToString("\n") { (tag, phrase) ->
                val score = phrase.score?.let { " :$it" } ?: ""
                val threshold = phrase.threshold?.let { " #$it" } ?: ""
                "${phrase.tokens.joinToString(" ")}$score$threshold @$tag"
            } + "\n")

            spotter = KeywordSpotter(
                config = KeywordSpotterConfig(
                    featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
                    modelConfig = OnlineModelConfig(
                        transducer = OnlineTransducerModelConfig(
                            encoder = File(model, "encoder.onnx").absolutePath,
                            decoder = File(model, "decoder.onnx").absolutePath,
                            joiner = File(model, "joiner.onnx").absolutePath,
                        ),
                        tokens = File(model, "tokens.txt").absolutePath,
                        modelType = "zipformer2",
                        modelingUnit = "cjkchar",
                        numThreads = 1,
                    ),
                    keywordsFile = keywordFile.absolutePath,
                    numTrailingBlanks = 1,
                    keywordsScore = 1.0f,
                    keywordsThreshold = 0.25f,
                ),
            )
            val stream = spotter.createStream()
            try {
                val minBuffer = AudioRecord.getMinBufferSize(
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                )
                check(minBuffer > 0) { "AudioRecord cannot use 16 kHz mono" }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return
                microphone = AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    maxOf(minBuffer * 2, 3200),
                )
                check(microphone.state == AudioRecord.STATE_INITIALIZED) { "AudioRecord failed to initialize" }
                synchronized(lock) {
                    if (generation != ownGeneration || stopped || appVisible || webViewCaptureActive || pendingMatch) return
                    recorder = microphone
                }
                if (!isCurrentCapture(ownGeneration)) return
                microphone.startRecording()
                val buffer = ShortArray(1600)
                while (isCurrentCapture(ownGeneration)) {
                    val count = microphone.read(buffer, 0, buffer.size)
                    if (count <= 0) continue
                    stream.acceptWaveform(FloatArray(count) { buffer[it] / 32768.0f }, SAMPLE_RATE)
                    while (spotter.isReady(stream)) {
                        spotter.decode(stream)
                        val tag = spotter.getResult(stream).keyword
                        val phrase = tags.firstOrNull { it.first == tag }?.second
                        if (phrase != null) {
                            onWake(ownGeneration, phrase)
                            return
                        }
                    }
                }
            } finally {
                stream.release()
            }
        } catch (error: Exception) {
            if (isCurrentCapture(ownGeneration)) {
                Log.e(TAG, "Background wake detection stopped", error)
                (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                    .notify(ERROR_NOTIFICATION_ID, errorNotification())
                stopSelf()
            }
        } finally {
            File(filesDir, "wake-word-keywords-$ownGeneration.txt").delete()
            microphone?.runCatching { stop() }
            microphone?.release()
            spotter?.release()
            synchronized(lock) {
                if (recorder === microphone) recorder = null
                // Keep the thread reference until the transition worker joins it.
            }
        }
    }

    private fun isCurrentCapture(ownGeneration: Int): Boolean = synchronized(lock) {
        generation == ownGeneration && !stopped && !appVisible && !webViewCaptureActive && !pendingMatch
    }

    /** A decoded keyword claims its generation before it writes the notification handoff. */
    private fun onWake(ownGeneration: Int, phrase: WakeKeyword) = synchronized(lock) {
        if (generation != ownGeneration || stopped || appVisible || webViewCaptureActive || pendingMatch) return@synchronized
        pendingMatch = true
        synchronized(pendingLock) {
            getSharedPreferences(PREFERENCES, MODE_PRIVATE).edit()
                .putString(PENDING_WAKE_ID, UUID.randomUUID().toString())
                .putString(PENDING_CHARACTER_ID, phrase.characterId)
                .putString(PENDING_TOKENS, JSONArray(phrase.tokens).toString())
                .putBoolean(NOTIFICATION_TAPPED, false)
                .apply()
        }
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .notify(LISTENING_NOTIFICATION_ID, waitingNotification())
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .notify(MATCH_NOTIFICATION_ID, matchNotification())
    }

    private fun prepareModel(): File {
        val directory = File(filesDir, MODEL_DIR)
        directory.mkdirs()
        for (name in arrayOf("encoder.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt")) {
            val target = File(directory, name)
            if (!target.exists() || target.length() == 0L) {
                val temporary = File(directory, "$name.download")
                try {
                    assets.open("$MODEL_DIR/$name").use { source ->
                        temporary.outputStream().use(source::copyTo)
                    }
                    check(temporary.renameTo(target)) { "Cannot install bundled KWS model file $name" }
                } finally {
                    temporary.delete()
                }
            }
        }
        return directory
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val listening = NotificationChannel(
            LISTENING_CHANNEL_ID,
            notificationText.listeningChannel,
            NotificationManager.IMPORTANCE_LOW,
        )
        val match = NotificationChannel(
            MATCH_CHANNEL_ID,
            notificationText.matchChannel,
            NotificationManager.IMPORTANCE_HIGH,
        )
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).apply {
            createNotificationChannel(listening)
            createNotificationChannel(match)
        }
    }

    private fun openPocketIntent(forWake: Boolean = false): PendingIntent = PendingIntent.getActivity(
        this,
        if (forWake) 1 else 0,
        Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            if (forWake) {
                action = ACTION_OPEN_WAKE
                putExtra(EXTRA_WAKE_ID, getSharedPreferences(PREFERENCES, MODE_PRIVATE).getString(PENDING_WAKE_ID, null))
            }
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun listeningNotification(): Notification = NotificationCompat.Builder(this, LISTENING_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(notificationText.listeningTitle)
        .setContentText(notificationText.listeningBody)
        .setOngoing(true)
        .setContentIntent(openPocketIntent(forWake = true))
        .build()

    private fun matchNotification(): Notification = NotificationCompat.Builder(this, MATCH_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(notificationText.matchTitle)
        .setContentText(notificationText.matchBody)
        .setAutoCancel(true)
        .setContentIntent(openPocketIntent(forWake = true))
        .build()

    private fun waitingNotification(): Notification = NotificationCompat.Builder(this, LISTENING_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(notificationText.matchTitle)
        .setContentText(notificationText.matchBody)
        .setOngoing(true)
        .setContentIntent(openPocketIntent(forWake = true))
        .build()

    private fun errorNotification(): Notification = NotificationCompat.Builder(this, MATCH_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(notificationText.errorTitle)
        .setContentText(notificationText.errorBody)
        .setAutoCancel(true)
        .setContentIntent(openPocketIntent())
        .build()

    override fun onDestroy() {
        stopAndRelease {}
        if (instance === this) instance = null
        super.onDestroy()
    }
}

internal data class WakeKeyword(
    val characterId: String,
    val tokens: List<String>,
    val score: Float?,
    val threshold: Float?,
)

internal fun parseKeywords(array: JSONArray): List<WakeKeyword> = buildList {
    for (index in 0 until array.length()) {
        val entry = array.getJSONObject(index)
        val tokens = entry.getJSONArray("tokens")
        add(WakeKeyword(
            characterId = entry.getString("characterId"),
            tokens = (0 until tokens.length()).map(tokens::getString),
            score = if (entry.has("score") && !entry.isNull("score")) entry.getDouble("score").toFloat() else null,
            threshold = if (entry.has("threshold") && !entry.isNull("threshold")) entry.getDouble("threshold").toFloat() else null,
        ))
    }
}

/** Localized notification content supplied by the foreground WebView. */
internal data class WakeNotificationText(
    val listeningChannel: String,
    val matchChannel: String,
    val listeningTitle: String,
    val listeningBody: String,
    val matchTitle: String,
    val matchBody: String,
    val errorTitle: String,
    val errorBody: String,
)

internal fun parseNotificationText(value: JSONObject): WakeNotificationText {
    fun text(key: String): String = value.getString(key).also {
        require(it.isNotBlank()) { "Missing notification text: $key" }
    }
    return WakeNotificationText(
        listeningChannel = text("listeningChannel"),
        matchChannel = text("matchChannel"),
        listeningTitle = text("listeningTitle"),
        listeningBody = text("listeningBody"),
        matchTitle = text("matchTitle"),
        matchBody = text("matchBody"),
        errorTitle = text("errorTitle"),
        errorBody = text("errorBody"),
    )
}
