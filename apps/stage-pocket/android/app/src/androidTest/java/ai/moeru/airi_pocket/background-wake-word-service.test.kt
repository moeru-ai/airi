package ai.moeru.airi_pocket

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Exercises Android notification delivery with a decoded keyword fixture. */
@RunWith(AndroidJUnit4::class)
class BackgroundWakeWordServiceTest {
    @Test
    fun staleDetectionCannotPublishAndNotificationOpensItsCharacter() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val preferences = context.getSharedPreferences(BackgroundWakeWordService.PREFERENCES, 0)
        manager.cancel(BackgroundWakeWordService.MATCH_NOTIFICATION_ID)
        manager.cancel(BackgroundWakeWordService.ERROR_NOTIFICATION_ID)
        preferences.edit().clear().commit()
        for (permission in listOf("android.permission.RECORD_AUDIO", "android.permission.POST_NOTIFICATIONS")) {
            android.os.ParcelFileDescriptor.AutoCloseInputStream(
                instrumentation.uiAutomation.executeShellCommand("pm grant ${context.packageName} $permission")
            ).use { it.readBytes() }
            assertEquals(android.content.pm.PackageManager.PERMISSION_GRANTED, context.checkSelfPermission(permission))
        }

        val launchIntent = Intent(context, MainActivity::class.java).apply {
            action = BackgroundWakeWordService.ACTION_OPEN_WAKE
        }
        ActivityScenario.launch<MainActivity>(launchIntent).use { scenario ->
            preferences.edit().clear().commit()
            var originalFailure: Throwable? = null
            try {
                scenario.onActivity { activity ->
                    activity.startForegroundService(Intent(activity, BackgroundWakeWordService::class.java).apply {
                        action = BackgroundWakeWordService.ACTION_CONFIGURE
                        putExtra(BackgroundWakeWordService.EXTRA_KEYWORDS,
                            """[{"characterId":"fixture-character","tokens":["HH","AH0","L","OW1"]}]""")
                        putExtra(BackgroundWakeWordService.EXTRA_NOTIFICATION_TEXT, JSONObject(mapOf(
                            "listeningChannel" to "Calling word listening",
                            "matchChannel" to "Calling word detected",
                            "listeningTitle" to "AIRI is listening for calling words",
                            "listeningBody" to "Tap to open AIRI",
                            "matchTitle" to "AIRI heard a calling word",
                            "matchBody" to "Tap to speak",
                            "errorTitle" to "AIRI calling word listening stopped",
                            "errorBody" to "Open Pocket to restart it",
                        )).toString())
                    })
                }
                awaitCondition { BackgroundWakeWordService.instance != null }
                scenario.moveToState(Lifecycle.State.CREATED)
                awaitCondition { !MainActivity.isVisible }
                val service = checkNotNull(BackgroundWakeWordService.instance)
                // Inject at the native detector boundary. This does not test recognition accuracy.
                val generationField = service.javaClass.getDeclaredField("generation").apply { isAccessible = true }
                val captureLock = checkNotNull(service.javaClass.getDeclaredField("lock").apply { isAccessible = true }.get(service))
                val decoded = service.javaClass.getDeclaredMethod("onWake", Int::class.javaPrimitiveType, WakeKeyword::class.java)
                    .apply { isAccessible = true }
                val phrase = WakeKeyword("fixture-character", listOf("HH", "AH0", "L", "OW1"), null, null)
                // The activity is hidden, but native capture still requires the WebView release acknowledgement.
                awaitHandoff(active = true)
                synchronized(captureLock) {
                    decoded.invoke(service, generationField.getInt(service), phrase)
                }
                assertFalse(preferences.contains(BackgroundWakeWordService.PENDING_CHARACTER_ID))

                awaitHandoff(active = false)
                synchronized(captureLock) {
                    val generation = generationField.getInt(service)
                    decoded.invoke(service, generation - 1, phrase)
                    assertFalse(preferences.contains(BackgroundWakeWordService.PENDING_CHARACTER_ID))
                    assertFalse(manager.activeNotifications.any { it.id == BackgroundWakeWordService.MATCH_NOTIFICATION_ID })
                    decoded.invoke(service, generation, phrase)
                }
                awaitCondition { manager.activeNotifications.any { it.id == BackgroundWakeWordService.MATCH_NOTIFICATION_ID } }
                assertEquals("fixture-character", preferences.getString(BackgroundWakeWordService.PENDING_CHARACTER_ID, null))
                assertFalse(preferences.getBoolean(BackgroundWakeWordService.NOTIFICATION_TAPPED, false))

                val wakeId = checkNotNull(preferences.getString(BackgroundWakeWordService.PENDING_WAKE_ID, null))
                assertTrue(wakeId.isNotBlank())
                context.startActivity(Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    action = BackgroundWakeWordService.ACTION_OPEN_WAKE
                    putExtra(BackgroundWakeWordService.EXTRA_WAKE_ID, "stale-notification")
                })
                awaitCondition { MainActivity.isVisible }
                assertFalse(preferences.getBoolean(BackgroundWakeWordService.NOTIFICATION_TAPPED, false))
                assertEquals(wakeId, preferences.getString(BackgroundWakeWordService.PENDING_WAKE_ID, null))

                val notification = manager.activeNotifications.single { it.id == BackgroundWakeWordService.MATCH_NOTIFICATION_ID }
                notification.notification.contentIntent.send()
                awaitCondition { preferences.getBoolean(BackgroundWakeWordService.NOTIFICATION_TAPPED, false) && MainActivity.isVisible }
                assertTrue(MainActivity.isVisible)
            } catch (failure: Throwable) {
                originalFailure = failure
                throw failure
            } finally {
                try {
                    awaitHandoff(active = true)
                } catch (cleanup: Throwable) {
                    if (originalFailure == null) throw cleanup
                    originalFailure.addSuppressed(cleanup)
                } finally {
                    context.stopService(Intent(context, BackgroundWakeWordService::class.java))
                    manager.cancel(BackgroundWakeWordService.MATCH_NOTIFICATION_ID)
                    manager.cancel(BackgroundWakeWordService.ERROR_NOTIFICATION_ID)
                    preferences.edit().clear().commit()
                    instrumentation.uiAutomation.executeShellCommand("cmd statusbar collapse").close()
                }
            }
        }
    }

    private fun awaitHandoff(active: Boolean) {
        val released = CountDownLatch(1)
        BackgroundWakeWordService.setWebViewCaptureActive(active) { released.countDown() }
        assertTrue("Native microphone release did not complete", released.await(10, TimeUnit.SECONDS))
    }

    private fun awaitCondition(predicate: () -> Boolean) {
        val deadline = System.nanoTime() + 10_000_000_000L
        while (!predicate()) {
            check(System.nanoTime() < deadline) { "Android wake-word state did not settle" }
            Thread.sleep(25)
        }
    }
}
