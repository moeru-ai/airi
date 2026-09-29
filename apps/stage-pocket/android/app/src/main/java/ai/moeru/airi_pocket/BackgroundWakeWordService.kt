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
import java.io.File
import kotlin.concurrent.thread

/**
 * Detects card wake words while Pocket is in the background. The service starts
 * from a visible activity because Android grants microphone access at that point.
 * A match stores only the target card ID. The user taps the notification before
 * Pocket opens a foreground speech window.
 */
class BackgroundWakeWordService : Service() {
    companion object {
        const val ACTION_CONFIGURE = "ai.moeru.airi_pocket.CONFIGURE_WAKE_WORDS"
        const val EXTRA_KEYWORDS = "keywords"
        const val PREFERENCES = "background_wake_word"
        const val PENDING_CHARACTER_ID = "pending_character_id"
        const val PENDING_TOKENS = "pending_tokens"
        const val NOTIFICATION_TAPPED = "notification_tapped"
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
    private var appVisible = true
    private var pendingMatch = false
    private var keywords = emptyList<WakeKeyword>()

    override fun onCreate() {
        super.onCreate()
        appVisible = MainActivity.isVisible
        instance = this
        createNotificationChannel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action != ACTION_CONFIGURE) return START_NOT_STICKY

        val incoming = intent.getStringExtra(EXTRA_KEYWORDS) ?: return START_NOT_STICKY
        val parsed = parseKeywords(JSONArray(incoming))
        if (parsed.isEmpty()) {
            stopSelf()
            return START_NOT_STICKY
        }

        synchronized(lock) {
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

    private fun restartCapture() {
        val previous: Thread?
        val nextGeneration: Int
        val activeKeywords: List<WakeKeyword>
        synchronized(lock) {
            generation += 1
            nextGeneration = generation
            recorder?.runCatching { stop() }
            previous = captureThread
            captureThread = null
            activeKeywords = keywords
        }
        // Do not let the next AudioRecord compete with the previous one.
        thread(name = "wake-word-transition") {
            previous?.join()
            synchronized(lock) {
                if (generation != nextGeneration || appVisible || pendingMatch || activeKeywords.isEmpty()) return@thread
                captureThread = thread(name = "wake-word-capture") { capture(nextGeneration, activeKeywords) }
            }
        }
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
                    if (generation != ownGeneration || appVisible || pendingMatch) return
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
                            onWake(phrase)
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
            synchronized(lock) {
                if (recorder === microphone) recorder = null
                if (captureThread === Thread.currentThread()) captureThread = null
            }
            microphone?.runCatching { stop() }
            microphone?.release()
            spotter?.release()
        }
    }

    private fun isCurrentCapture(ownGeneration: Int): Boolean = synchronized(lock) {
        generation == ownGeneration && !appVisible && !pendingMatch
    }

    private fun onWake(phrase: WakeKeyword) {
        synchronized(lock) { pendingMatch = true }
        getSharedPreferences(PREFERENCES, MODE_PRIVATE).edit()
            .putString(PENDING_CHARACTER_ID, phrase.characterId)
            .putString(PENDING_TOKENS, JSONArray(phrase.tokens).toString())
            .putBoolean(NOTIFICATION_TAPPED, false)
            .apply()
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
        val listening = NotificationChannel(
            LISTENING_CHANNEL_ID,
            "Wake word listening",
            NotificationManager.IMPORTANCE_LOW,
        )
        val match = NotificationChannel(
            MATCH_CHANNEL_ID,
            "Wake word detected",
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
            if (forWake) action = ACTION_OPEN_WAKE
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun listeningNotification(): Notification = NotificationCompat.Builder(this, LISTENING_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("AIRI is listening for wake words")
        .setContentText("Tap to open AIRI")
        .setOngoing(true)
        .setContentIntent(openPocketIntent(forWake = true))
        .build()

    private fun matchNotification(): Notification = NotificationCompat.Builder(this, MATCH_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("AIRI heard a wake word")
        .setContentText("Tap to speak")
        .setAutoCancel(true)
        .setContentIntent(openPocketIntent(forWake = true))
        .build()

    private fun waitingNotification(): Notification = NotificationCompat.Builder(this, LISTENING_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("AIRI heard a wake word")
        .setContentText("Tap to speak")
        .setOngoing(true)
        .setContentIntent(openPocketIntent(forWake = true))
        .build()

    private fun errorNotification(): Notification = NotificationCompat.Builder(this, MATCH_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("AIRI wake word listening stopped")
        .setContentText("Open Pocket to restart it")
        .setAutoCancel(true)
        .setContentIntent(openPocketIntent())
        .build()

    override fun onDestroy() {
        synchronized(lock) {
            generation += 1
            recorder?.runCatching { stop() }
        }
        instance = null
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
