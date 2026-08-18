package ai.moeru.airi_pocket.websocket

import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

interface HostWebSocketSession {
    fun send(text: String)
    fun close(code: Int?, reason: String?)
}

sealed interface HostWebSocketEvent {
    data object Open : HostWebSocketEvent
    data class Message(val text: String) : HostWebSocketEvent
    data class Error(val message: String) : HostWebSocketEvent
    data class Close(val code: Int?, val reason: String?) : HostWebSocketEvent
}

class HostWebSocketBridge(
    private val sessionFactory: (url: String, emit: (HostWebSocketEvent) -> Unit) -> HostWebSocketSession,
    private val eventSink: (payload: String) -> Unit,
) {
    private val sessions = ConcurrentHashMap<String, HostWebSocketSession>()

    fun handleCommand(payload: String) {
        val command = JSONObject(payload)
        when (command.getString("kind")) {
            "connect" -> handleConnect(command)
            "send" -> handleSend(command)
            "close" -> handleClose(command)
        }
    }

    fun dispose() {
        sessions.values.forEach { it.close(null, "Bridge disposed") }
        sessions.clear()
    }

    private fun handleConnect(command: JSONObject) {
        val id = command.getString("id")
        runCatching {
            sessionFactory(command.getString("url")) { event -> handleSessionEvent(id, event) }
        }
            .onSuccess { sessions[id] = it }
            .onFailure { error ->
                val message = error.message ?: "Failed to create websocket session"
                emitEvent(kind = "error", id = id) {
                    put("message", message)
                }
                emitEvent(kind = "close", id = id) {
                    put("reason", message)
                }
            }
    }

    private fun handleSend(command: JSONObject) {
        val id = command.getString("id")
        sessions[id]?.send(command.getString("data"))
    }

    private fun handleClose(command: JSONObject) {
        val id = command.getString("id")
        sessions[id]?.close(command.optNullableInt("code"), command.optNullableString("reason"))
    }

    private fun handleSessionEvent(id: String, event: HostWebSocketEvent) {
        when (event) {
            HostWebSocketEvent.Open -> emitEvent(kind = "open", id = id)
            is HostWebSocketEvent.Message -> emitEvent(kind = "message", id = id) {
                put("data", event.text)
            }
            is HostWebSocketEvent.Error -> emitEvent(kind = "error", id = id) {
                put("message", event.message)
            }
            is HostWebSocketEvent.Close -> {
                sessions.remove(id)
                emitEvent(kind = "close", id = id) {
                    event.code?.let { put("code", it) }
                    event.reason?.let { put("reason", it) }
                }
            }
        }
    }

    private fun emitEvent(
        kind: String,
        id: String,
        build: JSONObject.() -> Unit = {},
    ) {
        eventSink(
            JSONObject()
                .put("kind", kind)
                .put("id", id)
                .apply(build)
                .toString(),
        )
    }
}

private fun JSONObject.optNullableInt(key: String): Int? =
    if (has(key) && !isNull(key)) getInt(key) else null

private fun JSONObject.optNullableString(key: String): String? =
    if (has(key) && !isNull(key)) getString(key) else null
