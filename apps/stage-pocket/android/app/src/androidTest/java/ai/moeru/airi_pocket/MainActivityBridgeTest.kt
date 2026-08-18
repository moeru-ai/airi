package ai.moeru.airi_pocket

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import ai.moeru.airi_pocket.websocket.HostWebSocketEvent
import ai.moeru.airi_pocket.websocket.HostWebSocketSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class MainActivityBridgeTest {
    @After
    fun tearDown() {
        MainActivity.webSocketSessionFactoryOverrideForTesting = null
    }

    @Test
    fun javascriptInterfaceForwardsCommandsAndNativeEvents() {
        val factory = TestHostWebSocketSessionFactory()
        MainActivity.webSocketSessionFactoryOverrideForTesting = factory::create

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            val bridgeType = evaluateJavascript(scenario, "typeof window.AiriHostBridge?.postMessage")
            assertEquals("\"function\"", bridgeType)

            assertEquals(
                "\"ready\"",
                evaluateJavascript(
                    scenario,
                    """
                    (() => {
                      window.__airiBridgeProbe = [];
                      window.__airiHostBridge = {
                        onNativeMessage(payload) {
                          window.__airiBridgeProbe.push(JSON.parse(payload));
                        },
                      };
                      return 'ready';
                    })()
                    """.trimIndent(),
                ),
            )

            assertEquals(
                "\"connected\"",
                evaluateJavascript(
                    scenario,
                    """
                    (() => {
                      window.AiriHostBridge.postMessage(JSON.stringify({
                        kind: 'connect',
                        id: 'socket-1',
                        url: 'ws://example.test/ws',
                      }));
                      return 'connected';
                    })()
                    """.trimIndent(),
                ),
            )

            assertEquals(1, factory.createdSessions.size)
            val session = factory.createdSessions.single()
            assertEquals("ws://example.test/ws", session.url)

            assertEquals(
                "\"sent\"",
                evaluateJavascript(
                    scenario,
                    """
                    (() => {
                      window.AiriHostBridge.postMessage(JSON.stringify({
                        kind: 'send',
                        id: 'socket-1',
                        data: 'hello',
                      }));
                      return 'sent';
                    })()
                    """.trimIndent(),
                ),
            )
            assertEquals(listOf("hello"), session.sent)

            assertEquals(
                "\"closed\"",
                evaluateJavascript(
                    scenario,
                    """
                    (() => {
                      window.AiriHostBridge.postMessage(JSON.stringify({
                        kind: 'close',
                        id: 'socket-1',
                        code: 1000,
                        reason: 'done',
                      }));
                      return 'closed';
                    })()
                    """.trimIndent(),
                ),
            )
            assertEquals(1000, session.closeCode)
            assertEquals("done", session.closeReason)

            scenario.onActivity {
                session.emit(HostWebSocketEvent.Open)
                session.emit(HostWebSocketEvent.Message("hi"))
                session.emit(HostWebSocketEvent.Close(1001, "bye"))
            }

            val probe = evaluateJavascript(
                scenario,
                "JSON.stringify(window.__airiBridgeProbe)",
            )

            assertNotNull(probe)
            assertEquals(
                """[{"kind":"open","id":"socket-1"},{"kind":"message","id":"socket-1","data":"hi"},{"kind":"close","id":"socket-1","code":1001,"reason":"bye"}]""",
                probe,
            )
        }
    }

    private fun evaluateJavascript(
        scenario: ActivityScenario<MainActivity>,
        script: String,
    ): String? {
        val latch = CountDownLatch(1)
        val result = AtomicReference<String?>()

        scenario.onActivity { activity ->
            activity.evaluateJavascriptForTesting(script) {
                result.set(it)
                latch.countDown()
            }
        }

        check(latch.await(5, TimeUnit.SECONDS)) {
            "Timed out waiting for WebView JavaScript evaluation"
        }

        return result.get()
    }
}

private class TestHostWebSocketSessionFactory {
    val createdSessions = mutableListOf<TestHostWebSocketSession>()

    fun create(
        url: String,
        emit: (HostWebSocketEvent) -> Unit,
    ): HostWebSocketSession {
        val session = TestHostWebSocketSession(url, emit)
        createdSessions += session
        return session
    }
}

private class TestHostWebSocketSession(
    val url: String,
    private val eventSink: (HostWebSocketEvent) -> Unit,
) : HostWebSocketSession {
    val sent = mutableListOf<String>()
    var closeCode: Int? = null
    var closeReason: String? = null

    fun emit(event: HostWebSocketEvent) {
        eventSink(event)
    }

    override fun send(text: String) {
        sent += text
    }

    override fun close(code: Int?, reason: String?) {
        closeCode = code
        closeReason = reason
    }
}
