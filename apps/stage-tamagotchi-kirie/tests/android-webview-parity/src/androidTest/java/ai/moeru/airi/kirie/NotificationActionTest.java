package ai.moeru.airi.kirie;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.webkit.JavaScriptExecutionException;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewOutcomeReceiver;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import static org.junit.Assert.*;

public final class NotificationActionTest {
    private static final String ACTION_KEY = "LocalNotificationUserAction";
    private static final String ID_KEY = "LocalNotificationId";
    private static final String OBJECT_KEY = "LocalNotficationObject";
    private static final String STORAGE = "NOTIFICATION_STORE";

    @After public void clearStaticState() {
        Fixture.setStatic(AiriAndroidPlugin.class, "activePlugin", null);
        @SuppressWarnings("unchecked")
        List<JSONObject> pending = (List<JSONObject>) Fixture.getStatic(
            AiriAndroidPlugin.class,
            "pendingNotificationActions"
        );
        pending.clear();
    }

    @Test public void launchIntentMatchesCapacitorTapContract() throws Exception {
        String source = notificationSource(2468, System.currentTimeMillis() - 1_000L);
        Intent intent = (Intent) Fixture.callStatic(
            AiriAndroidPlugin.class,
            "configureNotificationLaunchIntent",
            new Class<?>[] { Intent.class, int.class, String.class },
            new Intent(),
            2468,
            source
        );

        assertEquals(Intent.ACTION_MAIN, intent.getAction());
        assertTrue(intent.hasCategory(Intent.CATEGORY_LAUNCHER));
        assertEquals(
            Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP,
            intent.getFlags()
        );
        assertEquals(2468, intent.getIntExtra(ID_KEY, Integer.MIN_VALUE));
        assertEquals("tap", intent.getStringExtra(ACTION_KEY));
        assertEquals(source, intent.getStringExtra(OBJECT_KEY));
    }

    @Test public void tapEmitsExactCallbackAndDeletesTriggeredOneShot() throws Exception {
        try (Fixture fixture = new Fixture()) {
            long firedAt = System.currentTimeMillis() - 1_000L;
            String source = notificationSource(2468, firedAt);
            SharedPreferences storage = fixture.activity.getSharedPreferences(STORAGE, Context.MODE_PRIVATE);
            storage.edit().putString(
                "2468",
                new JSONObject()
                    .put("id", 2468)
                    .put("title", "Parity title")
                    .put("body", "Parity body")
                    .put("at", firedAt)
                    .put(OBJECT_KEY, source)
                    .toString()
            ).commit();

            CapturingReplyProxy reply = new CapturingReplyProxy();
            Fixture.set(fixture.plugin, "eventaReplyProxy", reply);
            Fixture.set(fixture.plugin, "notificationActionListenerRegistered", true);
            Fixture.setStatic(AiriAndroidPlugin.class, "activePlugin", fixture.plugin);
            Intent intent = new Intent(Intent.ACTION_MAIN)
                .putExtra(ID_KEY, 2468)
                .putExtra(ACTION_KEY, "tap")
                .putExtra(OBJECT_KEY, source);

            Fixture.callStatic(
                AiriAndroidPlugin.class,
                "receiveNotificationAction",
                new Class<?>[] { Context.class, Intent.class },
                fixture.activity,
                intent
            );

            assertFalse(storage.contains("2468"));
            assertFalse(intent.hasExtra(ID_KEY));
            assertEquals(1, reply.messages.size());
            JSONObject envelope = new JSONObject(reply.messages.get(0));
            assertEquals(
                "eventa:event:airi:android:notification:action-performed",
                envelope.getString("type")
            );
            JSONObject action = envelope.getJSONObject("payload").getJSONObject("body");
            assertEquals("tap", action.getString("actionId"));
            assertEquals(new JSONObject(source).toString(), action.getJSONObject("notification").toString());
        }
    }

    @Test public void tapKeepsOneShotThatHasNotTriggered() throws Exception {
        try (Fixture fixture = new Fixture()) {
            long futureAt = System.currentTimeMillis() + 60_000L;
            String source = notificationSource(9753, futureAt);
            SharedPreferences storage = fixture.activity.getSharedPreferences(STORAGE, Context.MODE_PRIVATE);
            storage.edit().putString(
                "9753",
                new JSONObject()
                    .put("id", 9753)
                    .put("title", "Future title")
                    .put("body", "Future body")
                    .put("at", futureAt)
                    .put(OBJECT_KEY, source)
                    .toString()
            ).commit();

            Fixture.callStatic(
                AiriAndroidPlugin.class,
                "receiveNotificationAction",
                new Class<?>[] { Context.class, Intent.class },
                fixture.activity,
                new Intent(Intent.ACTION_MAIN)
                    .putExtra(ID_KEY, 9753)
                    .putExtra(ACTION_KEY, "tap")
                    .putExtra(OBJECT_KEY, source)
            );

            assertTrue(storage.contains("9753"));
        }
    }

    private static String notificationSource(int id, long at) throws Exception {
        return new JSONObject()
            .put("body", "Parity body")
            .put("id", id)
            .put("schedule", new JSONObject().put("at", java.time.Instant.ofEpochMilli(at).toString()))
            .put("title", "Parity title")
            .toString();
    }

    private static final class CapturingReplyProxy extends JavaScriptReplyProxy {
        final List<String> messages = new ArrayList<>();
        @Override public void postMessage(String message) { messages.add(message); }
        @Override public void postMessage(byte[] message) { throw new AssertionError(); }
        @Override public void executeJavaScript(
            String script,
            WebViewOutcomeReceiver<String, JavaScriptExecutionException> receiver
        ) { throw new AssertionError(); }
    }
}
