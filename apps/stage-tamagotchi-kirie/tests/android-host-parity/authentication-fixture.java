import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

// Android activity, URI and reply transport are the external boundaries.
class AuthenticationFixture {
    private final Activity activity = new Activity();
    private Activity getActivity() { return activity; }
    static final class Uri {
        private final URI uri;
        private Uri(String url) { uri = URI.create(url); }
        static Uri parse(String url) { return new Uri(url); }
        String getScheme() { return uri.getScheme(); }
    }
    static final class Intent {
        static final String ACTION_VIEW = "android.intent.action.VIEW";
        Intent(String action, Uri uri) {}
    }
    static final class Activity {
        RuntimeException failure;
        int opens;
        void runOnUiThread(Runnable task) { task.run(); }
        void startActivity(Intent intent) {
            if (failure != null) throw failure;
            opens++;
        }
    }
    static final class ActivityNotFoundException extends RuntimeException {}
    static final class Log {
        static void e(String tag, String message) {}
        static void e(String tag, String message, Throwable error) {}
    }
    static final class Reply {
        final List<JSONObject> messages = new ArrayList<>();
        void postMessage(String message) { messages.add(new JSONObject(message)); }
    }
    static final class PendingEventaRequest {
        final String event = "eventa:invoke:airi:android:authentication:open-send";
        final String invokeId = "fixture-1";
        final Reply replyProxy = new Reply();
    }
    /* PRODUCTION_METHODS */
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    private static void missingHandler(RuntimeException error) {
        AuthenticationFixture plugin = new AuthenticationFixture();
        plugin.activity.failure = error;
        PendingEventaRequest request = new PendingEventaRequest();
        plugin.openAuthorization("https://example.invalid/auth", request);
        require(request.replyProxy.messages.size() == 1, "Exactly one response is required");
        JSONObject response = request.replyProxy.messages.get(0);
        require(response.getString("type").equals(
            "eventa:invoke:airi:android:authentication:open-receive-error-fixture-1"
        ), "Missing browser must reject instead of resolving null");
        JSONObject failure = response.getJSONObject("payload").getJSONObject("body")
            .getJSONObject("content").getJSONObject("error");
        require(failure.getString("code").equals("BROWSER_UNAVAILABLE"), "Pocket browser error code must match");
        require(failure.getString("message").equals("No browser can open the authentication URL."),
            "Pocket browser error message must match");
    }
    private static void invalidUrl(String url, String message) {
        AuthenticationFixture plugin = new AuthenticationFixture();
        PendingEventaRequest request = new PendingEventaRequest();
        plugin.openAuthorization(url, request);
        require(plugin.activity.opens == 0, "Invalid authentication URL must not open a browser");
        require(request.replyProxy.messages.size() == 1, "Invalid URL must reject exactly once");
        JSONObject failure = request.replyProxy.messages.get(0).getJSONObject("payload")
            .getJSONObject("body").getJSONObject("content").getJSONObject("error");
        require(failure.getString("code").equals("INVALID_URL"),
            "Pocket invalid URL code must match");
        require(failure.getString("message").equals(message),
            "Pocket invalid URL message must match");
    }
    public static void main(String[] args) {
        missingHandler(new ActivityNotFoundException());
        missingHandler(new SecurityException("Intent denied"));
        invalidUrl(null, "The authentication URL is missing.");
        invalidUrl("", "The authentication URL is missing.");
        invalidUrl("   ", "The authentication URL is missing.");
        invalidUrl("ftp://example.invalid", "The authentication URL is invalid.");
        AuthenticationFixture plugin = new AuthenticationFixture();
        PendingEventaRequest request = new PendingEventaRequest();
        plugin.openAuthorization("https://example.invalid/auth", request);
        require(plugin.activity.opens == 1, "Healthy browser opens once");
        require(request.replyProxy.messages.get(0).getString("type").equals(
            "eventa:invoke:airi:android:authentication:open-receive-fixture-1"
        ), "Healthy browser still resolves");
        PendingEventaRequest existing = new PendingEventaRequest();
        plugin.sendEventaError(existing, "Notifications are not enabled on this device.");
        require(existing.replyProxy.messages.get(0).getJSONObject("payload").getJSONObject("body")
            .getJSONObject("content").getString("error").equals("Notifications are not enabled on this device."),
            "Existing string error envelopes remain unchanged");
        System.out.println("authentication: PASS 8 JVM cases");
    }
}
