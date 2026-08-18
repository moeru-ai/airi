package ai.moeru.airi_pocket.websocket

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HostWebSocketBridgeTest {
    @Test
    fun `connect command creates a session and emits open events`() {
        val events = mutableListOf<JSONObject>()
        val factory = RecordingSessionFactory()
        val bridge = HostWebSocketBridge(
            sessionFactory = factory::create,
            eventSink = { payload -> events += JSONObject(payload) },
        )

        bridge.handleCommand(
            JSONObject()
                .put("kind", "connect")
                .put("id", "socket-1")
                .put("url", "ws://example.test/ws")
                .toString(),
        )

        assertEquals(1, factory.createdSessions.size)
        val session = factory.createdSessions.single()
        assertEquals("ws://example.test/ws", session.url)

        session.emit(HostWebSocketEvent.Open)

        assertEquals("open", events.single().getString("kind"))
        assertEquals("socket-1", events.single().getString("id"))
    }

    @Test
    fun `send command forwards text to the matching session`() {
        val factory = RecordingSessionFactory()
        val bridge = HostWebSocketBridge(
            sessionFactory = factory::create,
            eventSink = { },
        )

        bridge.handleCommand(
            JSONObject()
                .put("kind", "connect")
                .put("id", "socket-1")
                .put("url", "ws://example.test/ws")
                .toString(),
        )

        bridge.handleCommand(
            JSONObject()
                .put("kind", "send")
                .put("id", "socket-1")
                .put("data", "hello")
                .toString(),
        )

        assertEquals(listOf("hello"), factory.createdSessions.single().sent)
    }

    @Test
    fun `send command targets the matching session id`() {
        val factory = RecordingSessionFactory()
        val bridge = HostWebSocketBridge(
            sessionFactory = factory::create,
            eventSink = { },
        )

        bridge.handleCommand(
            JSONObject()
                .put("kind", "connect")
                .put("id", "socket-1")
                .put("url", "ws://example.test/one")
                .toString(),
        )
        bridge.handleCommand(
            JSONObject()
                .put("kind", "connect")
                .put("id", "socket-2")
                .put("url", "ws://example.test/two")
                .toString(),
        )

        bridge.handleCommand(
            JSONObject()
                .put("kind", "send")
                .put("id", "socket-2")
                .put("data", "hello")
                .toString(),
        )

        assertEquals(emptyList<String>(), factory.createdSessions[0].sent)
        assertEquals(listOf("hello"), factory.createdSessions[1].sent)
    }

    @Test
    fun `close command closes the matching session`() {
        val factory = RecordingSessionFactory()
        val bridge = HostWebSocketBridge(
            sessionFactory = factory::create,
            eventSink = { },
        )

        bridge.handleCommand(
            JSONObject()
                .put("kind", "connect")
                .put("id", "socket-1")
                .put("url", "ws://example.test/ws")
                .toString(),
        )

        bridge.handleCommand(
            JSONObject()
                .put("kind", "close")
                .put("id", "socket-1")
                .put("code", 1000)
                .put("reason", "done")
                .toString(),
        )

        val session = factory.createdSessions.single()
        assertTrue(session.closed)
        assertEquals(1000, session.closeCode)
        assertEquals("done", session.closeReason)
    }

    @Test
    fun `session events are forwarded back to javascript`() {
        val events = mutableListOf<JSONObject>()
        val factory = RecordingSessionFactory()
        val bridge = HostWebSocketBridge(
            sessionFactory = factory::create,
            eventSink = { payload -> events += JSONObject(payload) },
        )

        bridge.handleCommand(
            JSONObject()
                .put("kind", "connect")
                .put("id", "socket-1")
                .put("url", "ws://example.test/ws")
                .toString(),
        )

        val session = factory.createdSessions.single()
        session.emit(HostWebSocketEvent.Message("hi"))
        session.emit(HostWebSocketEvent.Error("boom"))
        session.emit(HostWebSocketEvent.Close(1001, "bye"))

        assertEquals(listOf("message", "error", "close"), events.map { it.getString("kind") })
        assertEquals("hi", events[0].getString("data"))
        assertEquals("boom", events[1].getString("message"))
        assertEquals(1001, events[2].getInt("code"))
        assertEquals("bye", events[2].getString("reason"))
    }

    @Test
    fun `connect failure emits error and close events`() {
        val events = mutableListOf<JSONObject>()
        val bridge = HostWebSocketBridge(
            sessionFactory = { _, _ -> error("boom") },
            eventSink = { payload -> events += JSONObject(payload) },
        )

        bridge.handleCommand(
            JSONObject()
                .put("kind", "connect")
                .put("id", "socket-1")
                .put("url", "ws://example.test/ws")
                .toString(),
        )

        assertEquals(listOf("error", "close"), events.map { it.getString("kind") })
        assertEquals("boom", events[0].getString("message"))
        assertFalse(events[1].has("code"))
        assertEquals("boom", events[1].getString("reason"))
    }

    @Test
    fun `dispose closes active sessions`() {
        val factory = RecordingSessionFactory()
        val bridge = HostWebSocketBridge(
            sessionFactory = factory::create,
            eventSink = { },
        )

        bridge.handleCommand(
            JSONObject()
                .put("kind", "connect")
                .put("id", "socket-1")
                .put("url", "ws://example.test/ws")
                .toString(),
        )

        val session = factory.createdSessions.single()
        assertFalse(session.closed)

        bridge.dispose()

        assertTrue(session.closed)
        assertEquals("Bridge disposed", session.closeReason)
    }
}

private class RecordingSessionFactory {
    val createdSessions = mutableListOf<RecordingSession>()

    fun create(
        url: String,
        emit: (HostWebSocketEvent) -> Unit,
    ): HostWebSocketSession {
        val session = RecordingSession(url, emit)
        createdSessions += session
        return session
    }
}

private class RecordingSession(
    val url: String,
    private val eventSink: (HostWebSocketEvent) -> Unit,
) : HostWebSocketSession {
    val sent = mutableListOf<String>()
    var closed = false
    var closeCode: Int? = null
    var closeReason: String? = null

    fun emit(event: HostWebSocketEvent) {
        eventSink(event)
    }

    override fun send(text: String) {
        sent += text
    }

    override fun close(code: Int?, reason: String?) {
        closed = true
        closeCode = code
        closeReason = reason
    }
}
