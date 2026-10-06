import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

// The OkHttp callback inputs and the browser event sink are external boundaries.
class WebSocketFixture {
    private final Map<String, WebSocket> sessions = new HashMap<>();
    private final List<JSONObject> events = new ArrayList<>();
    private final String id = "opened-fixture-session";
    static final class WebSocket {}
    static final class Response {
        int code() { return 503; }
    }
    private void emit(JSONObject event) { events.add(event); }
    /* PRODUCTION_METHODS */
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    private static void failure(String message, Response response) {
        WebSocketFixture bridge = new WebSocketFixture();
        WebSocket socket = new WebSocket();
        bridge.sessions.put(bridge.id, socket);
        bridge.onFailure(socket, new Throwable(message), response);
        require(bridge.events.size() == 2, "One error and one close event are required");
        JSONObject error = bridge.events.get(0);
        JSONObject close = bridge.events.get(1);
        require(error.getString("kind").equals("error"), "The error event comes first");
        require(error.getString("message").equals(message == null ? "WebSocket failure" : message),
            "Only the error event uses Pocket's fallback message");
        require(close.getString("kind").equals("close"), "The close event follows the error");
        require(close.has("reason") == (message != null), "A null Throwable message omits the close reason");
        if (message != null) require(close.getString("reason").equals(message), "The close reason preserves the message");
        require(close.has("code") == (response != null), "The close code follows the optional HTTP response");
        if (response != null) require(close.getInt("code") == 503, "The HTTP failure code is preserved");
        require(close.getString("id").equals(bridge.id), "The event retains its session id");
        require(bridge.sessions.isEmpty(), "Failure removes the opened session");
    }
    public static void main(String[] args) {
        for (String message : new String[] { null, "", "Socket interrupted" }) {
            failure(message, null);
            failure(message, new Response());
        }
        System.out.println("websocket: PASS 6 JVM cases");
    }
}
