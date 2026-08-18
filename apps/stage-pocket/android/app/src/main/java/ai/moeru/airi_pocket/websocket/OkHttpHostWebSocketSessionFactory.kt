package ai.moeru.airi_pocket.websocket

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

private const val NORMAL_CLOSURE_STATUS_CODE = 1000

class OkHttpHostWebSocketSessionFactory(
    private val client: OkHttpClient,
) {
    fun create(
        url: String,
        emit: (HostWebSocketEvent) -> Unit,
    ): HostWebSocketSession {
        lateinit var socket: WebSocket

        socket = client.newWebSocket(
            Request.Builder()
                .url(url)
                .build(),
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    emit(HostWebSocketEvent.Open)
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    emit(HostWebSocketEvent.Message(text))
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(code, reason)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    emit(HostWebSocketEvent.Close(code, reason))
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    val message = t.message ?: "WebSocket failure"
                    emit(HostWebSocketEvent.Error(message))
                    emit(HostWebSocketEvent.Close(response?.code, t.message))
                }
            },
        )

        return object : HostWebSocketSession {
            override fun send(text: String): Unit {
                socket.send(text)
            }

            override fun close(code: Int?, reason: String?): Unit {
                socket.close(code ?: NORMAL_CLOSURE_STATUS_CODE, reason)
            }
        }
    }
}
