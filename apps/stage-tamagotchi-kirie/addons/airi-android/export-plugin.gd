@tool
extends EditorExportPlugin

const ANDROID_BUILD_ROOT = "res://android/build"
const DAY_RESOURCES = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <bool name="airi_is_light_theme">true</bool>
    <color name="airi_system_bar_color">#FFFFFF</color>
</resources>
"""
const NIGHT_RESOURCES = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <bool name="airi_is_light_theme">false</bool>
    <color name="airi_system_bar_color">#303030</color>
</resources>
"""
const ANDROID_PLUGIN_SOURCE = """package ai.moeru.airi.kirie;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.ActivityNotFoundException;
import android.content.ComponentCallbacks;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.core.app.NotificationCompat;

import com.outsystems.plugins.barcode.controller.OSBARCController;
import com.outsystems.plugins.barcode.model.OSBARCScanParameters;
import com.outsystems.plugins.barcode.model.OSBARCScannerHint;

import com.godot.game.R;

import org.godotengine.godot.Godot;
import org.godotengine.godot.plugin.GodotPlugin;
import org.godotengine.godot.plugin.SignalInfo;
import org.godotengine.godot.plugin.UsedByGodot;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import org.json.JSONException;
import org.json.JSONObject;

public final class AiriAndroidPlugin extends GodotPlugin {
    private static final String EVENTA_CHANNEL = "AiriAndroidEventa";
    private static final String EVENTA_ORIGIN = "https://res.kirie.invalid";
    private static final String CHECK_PERMISSION_EVENT =
        "eventa:invoke:airi:android:permission:check-send";
    private static final String REQUEST_PERMISSION_EVENT =
        "eventa:invoke:airi:android:permission:request-send";
    private static final String OPEN_PERMISSION_SETTINGS_EVENT =
        "eventa:invoke:airi:android:permission:open-settings-send";
    private static final String SCAN_BARCODE_EVENT =
        "eventa:invoke:airi:android:barcode:scan-send";
    private static final String SCHEDULE_NOTIFICATION_EVENT =
        "eventa:invoke:airi:android:notification:schedule-send";
    private static final String OPEN_AUTHORIZATION_EVENT =
        "eventa:invoke:airi:android:authentication:open-send";
    private static final String CONSUME_PENDING_URL_OPEN_EVENT =
        "eventa:invoke:airi:android:app:url-open:consume-send";
    private static final String URL_OPEN_EVENT =
        "eventa:event:airi:android:app:url-open";
    private static final String NOTIFICATION_ACTION =
        "ai.moeru.airi.kirie.action.SHOW_NOTIFICATION";
    private static final String NOTIFICATION_CHANNEL_ID = "default";
    private static final String NOTIFICATION_EXTRA_BODY = "body";
    private static final String NOTIFICATION_EXTRA_ID = "id";
    private static final String NOTIFICATION_EXTRA_TITLE = "title";
    private static final String NOTIFICATIONS = "notifications";
    private static final String MICROPHONE = "microphone";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4101;
    private static final int MICROPHONE_PERMISSION_REQUEST = 4102;
    private static final int FILE_CHOOSER_REQUEST = 4103;
    private static final int BARCODE_SCAN_REQUEST = 112;
    private static final SignalInfo PERMISSION_RESULT =
        new SignalInfo("permission_result", String.class, Boolean.class);
    private static final int LIGHT_SYSTEM_BARS =
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
    private static AiriAndroidPlugin activePlugin;
    private static String pendingUrlOpen;
    private ComponentCallbacks configurationCallbacks;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WebView browserWebView;
    private final OSBARCController barcodeController = new OSBARCController();
    private final Map<String, PendingEventaRequest> pendingPermissionRequests =
        new HashMap<>();
    private PendingEventaRequest pendingBarcodeScan;
    private PendingNotificationSchedule pendingNotificationSchedule;
    private ValueCallback<Uri[]> pendingFileChooser;
    private JavaScriptReplyProxy eventaReplyProxy;

    public AiriAndroidPlugin(Godot godot) {
        super(godot);
    }

    @Override
    public String getPluginName() {
        return "AiriAndroid";
    }

    @Override
    public Set<SignalInfo> getPluginSignals() {
        return Collections.singleton(PERMISSION_RESULT);
    }

    @Override
    public View onMainCreate(Activity activity) {
        activePlugin = this;
        configurationCallbacks = new ComponentCallbacks() {
            @Override
            public void onConfigurationChanged(Configuration configuration) {
                applySystemBarStyle(activity);
            }

            @Override
            public void onLowMemory() {
            }
        };
        activity.registerComponentCallbacks(configurationCallbacks);
        applySystemBarStyle(activity);
        installBrowserChannel(activity, 100);
        dispatchPendingUrlOpen();
        return null;
    }

    @Override
    public void onMainDestroy() {
        Activity activity = getActivity();
        if (activity != null && configurationCallbacks != null) {
            activity.unregisterComponentCallbacks(configurationCallbacks);
            configurationCallbacks = null;
        }
        mainHandler.removeCallbacksAndMessages(null);
        if (activePlugin == this) {
            activePlugin = null;
        }
        browserWebView = null;
        eventaReplyProxy = null;
        pendingPermissionRequests.clear();
        pendingBarcodeScan = null;
        pendingNotificationSchedule = null;
        if (pendingFileChooser != null) {
            pendingFileChooser.onReceiveValue(null);
            pendingFileChooser = null;
        }
    }

    @Override
    public void onMainActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST && pendingFileChooser != null) {
            ValueCallback<Uri[]> callback = pendingFileChooser;
            pendingFileChooser = null;
            Uri[] result;
            if (resultCode == Activity.RESULT_OK
                && data != null
                && data.getClipData() != null) {
                int itemCount = data.getClipData().getItemCount();
                result = new Uri[itemCount];
                for (int index = 0; index < itemCount; index += 1) {
                    result[index] = data.getClipData().getItemAt(index).getUri();
                }
            } else {
                result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
            callback.onReceiveValue(result);
            return;
        }

        if (requestCode != BARCODE_SCAN_REQUEST || pendingBarcodeScan == null) {
            return;
        }

        PendingEventaRequest pending = pendingBarcodeScan;
        pendingBarcodeScan = null;
        barcodeController.handleActivityResult(
            requestCode,
            resultCode,
            data,
            scanResult -> {
                try {
                    sendEventaResponse(
                        pending,
                        new JSONObject()
                            .put("ScanResult", scanResult.getText())
                            .put("format", scanResult.getFormat().ordinal())
                    );
                } catch (JSONException error) {
                    Log.e("AiriAndroid", "Cannot create barcode response", error);
                }
                return kotlin.Unit.INSTANCE;
            },
            scanError -> {
                try {
                    sendEventaResponse(
                        pending,
                        new JSONObject().put("error", scanError.getDescription())
                    );
                } catch (JSONException error) {
                    Log.e("AiriAndroid", "Cannot create barcode error response", error);
                }
                return kotlin.Unit.INSTANCE;
            }
        );
    }

    @Override
    public void onMainRequestPermissionsResult(
        int requestCode,
        String[] permissions,
        int[] grantResults
    ) {
        String permission = permissionName(requestCode);
        if (permission == null) {
            return;
        }

        boolean granted = grantResults.length > 0
            && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        emitSignal(PERMISSION_RESULT, permission, granted);
        PendingEventaRequest pending = pendingPermissionRequests.remove(permission);
        if (pending != null) {
            sendPermissionEventaResponse(pending, granted);
        }
    }

    @Override
    public void onMainResume() {
        applySystemBarStyle(getActivity());
        resumePendingNotificationSchedule();
        dispatchPendingUrlOpen();
    }

    @Override
    public void onGodotMainLoopStarted() {
        Activity activity = getActivity();
        applySystemBarStyle(activity);
        installBrowserChannel(activity, 100);
    }

    @UsedByGodot
    public boolean checkPermission(String permission) {
        Activity activity = getActivity();
        if (activity == null) {
            return false;
        }

        if (NOTIFICATIONS.equals(permission)
            && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true;
        }

        String androidPermission = androidPermission(permission);
        if (androidPermission == null) {
            return false;
        }

        return activity.checkSelfPermission(androidPermission)
            == PackageManager.PERMISSION_GRANTED;
    }

    @UsedByGodot
    public void requestPermission(String permission) {
        Activity activity = getActivity();
        String androidPermission = androidPermission(permission);
        int requestCode = permissionRequestCode(permission);
        if (activity == null || androidPermission == null || requestCode == 0) {
            emitSignal(PERMISSION_RESULT, permission, false);
            return;
        }

        activity.runOnUiThread(() -> {
            if (checkPermission(permission)) {
                emitSignal(PERMISSION_RESULT, permission, true);
                return;
            }

            activity.requestPermissions(new String[] { androidPermission }, requestCode);
        });
    }

    @UsedByGodot
    public void openPermissionSettings(String permission) {
        Activity activity = getActivity();
        if (activity == null) {
            return;
        }

        activity.runOnUiThread(() -> {
            Intent intent;
            if (NOTIFICATIONS.equals(permission) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName());
            } else {
                intent = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + activity.getPackageName())
                );
            }
            activity.startActivity(intent);
        });
    }

    private void applySystemBarStyle(Activity activity) {
        if (activity == null) {
            return;
        }

        activity.runOnUiThread(() -> {
            applySystemBarStyleNow(activity);
            new Handler(Looper.getMainLooper()).postDelayed(
                () -> applySystemBarStyleNow(activity),
                1000
            );
        });
    }

    private void installBrowserChannel(Activity activity, int attemptsRemaining) {
        if (activity == null || browserWebView != null || attemptsRemaining == 0) {
            return;
        }

        mainHandler.post(() -> {
            WebView webView = findWebView(activity.getWindow().getDecorView());
            if (webView == null) {
                mainHandler.postDelayed(
                    () -> installBrowserChannel(activity, attemptsRemaining - 1),
                    100
                );
                return;
            }

            browserWebView = webView;
            webView.getSettings().setSupportMultipleWindows(true);
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onShowFileChooser(
                    WebView source,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams parameters
                ) {
                    if (pendingFileChooser != null) {
                        pendingFileChooser.onReceiveValue(null);
                    }
                    pendingFileChooser = callback;
                    Intent intent = parameters.createIntent();
                    if (parameters.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    }
                    try {
                        activity.startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    } catch (ActivityNotFoundException error) {
                        pendingFileChooser = null;
                        callback.onReceiveValue(null);
                    }
                    return true;
                }

                @Override
                public boolean onCreateWindow(
                    WebView source,
                    boolean isDialog,
                    boolean isUserGesture,
                    Message resultMessage
                ) {
                    WebView popup = new WebView(activity);
                    popup.setWebViewClient(new WebViewClient() {
                        @Override
                        public boolean shouldOverrideUrlLoading(
                            WebView view,
                            WebResourceRequest request
                        ) {
                            boolean handled = openExternalBrowser(activity, request.getUrl());
                            if (handled) {
                                view.destroy();
                            }
                            return handled;
                        }

                        @Override
                        public boolean shouldOverrideUrlLoading(WebView view, String url) {
                            boolean handled = openExternalBrowser(activity, Uri.parse(url));
                            if (handled) {
                                view.destroy();
                            }
                            return handled;
                        }
                    });
                    WebView.WebViewTransport transport
                        = (WebView.WebViewTransport) resultMessage.obj;
                    transport.setWebView(popup);
                    resultMessage.sendToTarget();
                    return true;
                }
            });
            WebViewCompat.addWebMessageListener(
                webView,
                EVENTA_CHANNEL,
                Collections.singleton(EVENTA_ORIGIN),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || message.getType() != WebMessageCompat.TYPE_STRING) {
                        return;
                    }

                    handleEventaMessage(message.getData(), replyProxy);
                }
            );
            webView.reload();
        });
    }

    private boolean openExternalBrowser(Activity activity, Uri uri) {
        String scheme = uri.getScheme();
        if (!("http".equals(scheme) || "https".equals(scheme))) {
            return false;
        }

        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Log.e("AiriAndroid", "No browser can open the external URL", error);
        }
        return true;
    }

    private WebView findWebView(View view) {
        if (view instanceof WebView) {
            return (WebView) view;
        }
        if (!(view instanceof ViewGroup)) {
            return null;
        }

        ViewGroup group = (ViewGroup) view;
        for (int index = 0; index < group.getChildCount(); index += 1) {
            WebView webView = findWebView(group.getChildAt(index));
            if (webView != null) {
                return webView;
            }
        }
        return null;
    }

    private void handleEventaMessage(String message, JavaScriptReplyProxy replyProxy) {
        eventaReplyProxy = replyProxy;
        try {
            JSONObject envelope = new JSONObject(message);
            JSONObject payload = envelope.getJSONObject("payload");
            String event = payload.getString("id");
            JSONObject body = payload.getJSONObject("body");
            String invokeId = body.getString("invokeId");
            JSONObject content = body.getJSONObject("content");

            if (SCAN_BARCODE_EVENT.equals(event)) {
                startBarcodeScanner(
                    content.getString("scanInstructions"),
                    new PendingEventaRequest(event, invokeId, replyProxy)
                );
                return;
            }
            if (SCHEDULE_NOTIFICATION_EVENT.equals(event)) {
                scheduleNotification(
                    new PendingEventaRequest(event, invokeId, replyProxy),
                    content.getInt("id"),
                    content.getString("title"),
                    content.getString("body"),
                    content.getLong("at")
                );
                return;
            }
            if (OPEN_AUTHORIZATION_EVENT.equals(event)) {
                openAuthorization(
                    content.getString("url"),
                    new PendingEventaRequest(event, invokeId, replyProxy)
                );
                return;
            }
            if (CONSUME_PENDING_URL_OPEN_EVENT.equals(event)) {
                String url = pendingUrlOpen;
                pendingUrlOpen = null;
                JSONObject response = new JSONObject();
                if (url != null) {
                    response.put("url", url);
                }
                sendEventaResponse(
                    new PendingEventaRequest(event, invokeId, replyProxy),
                    response
                );
                return;
            }

            String permission = content.getString("permission");

            if (CHECK_PERMISSION_EVENT.equals(event)) {
                sendEventaResponse(
                    new PendingEventaRequest(event, invokeId, replyProxy),
                    new JSONObject().put("granted", checkPermission(permission))
                );
                return;
            }
            if (REQUEST_PERMISSION_EVENT.equals(event)) {
                if (checkPermission(permission)) {
                    sendEventaResponse(
                        new PendingEventaRequest(event, invokeId, replyProxy),
                        new JSONObject().put("granted", true)
                    );
                    return;
                }

                pendingPermissionRequests.put(
                    permission,
                    new PendingEventaRequest(event, invokeId, replyProxy)
                );
                requestPermission(permission);
                return;
            }
            if (OPEN_PERMISSION_SETTINGS_EVENT.equals(event)) {
                openPermissionSettings(permission);
                sendEventaResponse(
                    new PendingEventaRequest(event, invokeId, replyProxy),
                    JSONObject.NULL
                );
            }
        } catch (JSONException error) {
            Log.e("AiriAndroid", "Cannot handle Eventa message", error);
        }
    }

    private void openAuthorization(String url, PendingEventaRequest request) {
        Activity activity = getActivity();
        Uri uri = Uri.parse(url);
        if (activity == null
            || uri.getScheme() == null
            || !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))) {
            Log.e("AiriAndroid", "Cannot open an invalid authorization URL");
            sendEventaResponse(request, JSONObject.NULL);
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException error) {
                Log.e("AiriAndroid", "No browser can open the authorization URL", error);
            }
            sendEventaResponse(request, JSONObject.NULL);
        });
    }

    private static void receiveUrlOpen(String url) {
        pendingUrlOpen = url;
        if (activePlugin != null) {
            activePlugin.dispatchPendingUrlOpen();
        }
    }

    private void dispatchPendingUrlOpen() {
        String url = pendingUrlOpen;
        JavaScriptReplyProxy replyProxy = eventaReplyProxy;
        if (url == null || replyProxy == null) {
            return;
        }

        try {
            JSONObject payload = new JSONObject()
                .put("body", new JSONObject().put("url", url));
            JSONObject envelope = new JSONObject()
                .put("type", URL_OPEN_EVENT)
                .put("payload", payload);
            replyProxy.postMessage(envelope.toString());
            pendingUrlOpen = null;
        } catch (JSONException error) {
            Log.e("AiriAndroid", "Cannot send URL open event", error);
        }
    }

    private void startBarcodeScanner(
        String scanInstructions,
        PendingEventaRequest pending
    ) {
        Activity activity = getActivity();
        if (activity == null) {
            return;
        }

        pendingBarcodeScan = pending;
        OSBARCScanParameters parameters = new OSBARCScanParameters(
            scanInstructions,
            null,
            null,
            false,
            "",
            OSBARCScannerHint.QR_CODE,
            null,
            null,
            null,
            null
        );
        activity.runOnUiThread(() -> barcodeController.scanCode(activity, parameters));
    }

    private void scheduleNotification(
        PendingEventaRequest request,
        int id,
        String title,
        String body,
        long at
    ) {
        Activity activity = getActivity();
        if (activity == null) {
            return;
        }

        PendingNotificationSchedule schedule = new PendingNotificationSchedule(
            request,
            id,
            title,
            body,
            at
        );
        AlarmManager alarmManager = activity.getSystemService(AlarmManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && !alarmManager.canScheduleExactAlarms()) {
            pendingNotificationSchedule = schedule;
            activity.runOnUiThread(() -> activity.startActivity(
                new Intent(
                    Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + activity.getPackageName())
                )
            ));
            return;
        }

        scheduleNotificationAlarm(activity, alarmManager, schedule);
        sendEventaResponse(request, JSONObject.NULL);
    }

    private void resumePendingNotificationSchedule() {
        Activity activity = getActivity();
        PendingNotificationSchedule schedule = pendingNotificationSchedule;
        if (activity == null || schedule == null) {
            return;
        }

        AlarmManager alarmManager = activity.getSystemService(AlarmManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && !alarmManager.canScheduleExactAlarms()) {
            return;
        }

        pendingNotificationSchedule = null;
        scheduleNotificationAlarm(activity, alarmManager, schedule);
        sendEventaResponse(schedule.request, JSONObject.NULL);
    }

    private void scheduleNotificationAlarm(
        Context context,
        AlarmManager alarmManager,
        PendingNotificationSchedule schedule
    ) {
        Intent intent = new Intent(context, NotificationReceiver.class)
            .setAction(NOTIFICATION_ACTION)
            .putExtra(NOTIFICATION_EXTRA_ID, schedule.id)
            .putExtra(NOTIFICATION_EXTRA_TITLE, schedule.title)
            .putExtra(NOTIFICATION_EXTRA_BODY, schedule.body);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            schedule.id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        alarmManager.setExactAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            schedule.at,
            pendingIntent
        );
    }

    private void sendEventaResponse(PendingEventaRequest request, Object content) {
        try {
            String responseEvent = request.event.replace("-send", "-receive")
                + "-" + request.invokeId;
            JSONObject body = new JSONObject()
                .put("invokeId", request.invokeId)
                .put("content", content);
            JSONObject payload = new JSONObject().put("body", body);
            JSONObject envelope = new JSONObject()
                .put("type", responseEvent)
                .put("payload", payload);
            request.replyProxy.postMessage(envelope.toString());
        } catch (JSONException error) {
            Log.e("AiriAndroid", "Cannot send Eventa response", error);
        }
    }

    private void sendPermissionEventaResponse(
        PendingEventaRequest request,
        boolean granted
    ) {
        try {
            sendEventaResponse(request, new JSONObject().put("granted", granted));
        } catch (JSONException error) {
            Log.e("AiriAndroid", "Cannot create permission response", error);
        }
    }

    private static final class PendingEventaRequest {
        private final String event;
        private final String invokeId;
        private final JavaScriptReplyProxy replyProxy;

        private PendingEventaRequest(
            String event,
            String invokeId,
            JavaScriptReplyProxy replyProxy
        ) {
            this.event = event;
            this.invokeId = invokeId;
            this.replyProxy = replyProxy;
        }
    }

    private static final class PendingNotificationSchedule {
        private final PendingEventaRequest request;
        private final int id;
        private final String title;
        private final String body;
        private final long at;

        private PendingNotificationSchedule(
            PendingEventaRequest request,
            int id,
            String title,
            String body,
            long at
        ) {
            this.request = request;
            this.id = id;
            this.title = title;
            this.body = body;
            this.at = at;
        }
    }

    public static final class DeepLinkActivity extends Activity {
        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            forwardUrl(getIntent());
        }

        @Override
        protected void onNewIntent(Intent intent) {
            super.onNewIntent(intent);
            forwardUrl(intent);
        }

        private void forwardUrl(Intent sourceIntent) {
            String url = sourceIntent.getDataString();
            if (url != null) {
                receiveUrlOpen(url);
            }

            Intent launchIntent = getPackageManager()
                .getLaunchIntentForPackage(getPackageName());
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                startActivity(launchIntent);
            }
            finish();
        }
    }

    public static final class NotificationReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!NOTIFICATION_ACTION.equals(intent.getAction())) {
                return;
            }

            int id = intent.getIntExtra(NOTIFICATION_EXTRA_ID, 0);
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Default",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("hasDescription");
            manager.createNotificationChannel(channel);

            Intent launchIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
            PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                id,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            NotificationCompat.Builder notification = new NotificationCompat.Builder(
                context,
                NOTIFICATION_CHANNEL_ID
            )
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(intent.getStringExtra(NOTIFICATION_EXTRA_TITLE))
                .setContentText(intent.getStringExtra(NOTIFICATION_EXTRA_BODY))
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);
            manager.notify(id, notification.build());
        }
    }

    private void applySystemBarStyleNow(Activity activity) {
        boolean light = activity.getResources().getBoolean(R.bool.airi_is_light_theme);
        Window window = activity.getWindow();
        int color = activity.getColor(R.color.airi_system_bar_color);
        window.getDecorView().setBackgroundColor(color);
        window.setStatusBarColor(color);
        window.setNavigationBarColor(color);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(light ? LIGHT_SYSTEM_BARS : 0, LIGHT_SYSTEM_BARS);
            }
            return;
        }

        View decorView = window.getDecorView();
        int visibility = decorView.getSystemUiVisibility();
        int lightFlags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            lightFlags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decorView.setSystemUiVisibility(light ? visibility | lightFlags : visibility & ~lightFlags);
    }

    private String androidPermission(String permission) {
        if (NOTIFICATIONS.equals(permission)) {
            return Manifest.permission.POST_NOTIFICATIONS;
        }
        if (MICROPHONE.equals(permission)) {
            return Manifest.permission.RECORD_AUDIO;
        }
        return null;
    }

    private int permissionRequestCode(String permission) {
        if (NOTIFICATIONS.equals(permission)) {
            return NOTIFICATION_PERMISSION_REQUEST;
        }
        if (MICROPHONE.equals(permission)) {
            return MICROPHONE_PERMISSION_REQUEST;
        }
        return 0;
    }

    private String permissionName(int requestCode) {
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            return NOTIFICATIONS;
        }
        if (requestCode == MICROPHONE_PERMISSION_REQUEST) {
            return MICROPHONE;
        }
        return null;
    }
}
"""

func _get_name() -> String:
	return "AiriAndroid"

func _supports_platform(platform: EditorExportPlatform) -> bool:
	return platform.get_os_name().to_lower() == "android"

func _get_android_dependencies(_platform: EditorExportPlatform, _debug: bool) -> PackedStringArray:
	return PackedStringArray([
		"io.ionic.libs:ionbarcode-android:2.1.1@aar",
		"androidx.appcompat:appcompat:1.7.1",
		"androidx.activity:activity-ktx:1.10.1",
		"org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm:1.10.2",
		"org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2",
		"com.google.zxing:core:3.5.3",
		"com.google.mlkit:barcode-scanning:17.3.0",
		"androidx.camera:camera-camera2:1.5.1",
		"androidx.camera:camera-lifecycle:1.5.1",
		"androidx.camera:camera-view:1.5.1",
		"androidx.activity:activity-compose:1.10.1",
		"androidx.compose.material3:material3:1.4.0",
		"androidx.compose.material3:material3-window-size-class:1.4.0",
	])

func _export_begin(features: PackedStringArray, _is_debug: bool, _path: String, _flags: int) -> void:
	if not features.has("android"):
		return

	write_build_file("res/values/airi-theme.xml", DAY_RESOURCES)
	write_build_file("res/values-night/airi-theme.xml", NIGHT_RESOURCES)
	write_build_file("src/main/java/ai/moeru/airi/kirie/AiriAndroidPlugin.java", ANDROID_PLUGIN_SOURCE)

func _get_android_manifest_application_element_contents(_platform: EditorExportPlatform, _debug: bool) -> String:
	return """
        <meta-data
            android:name="org.godotengine.plugin.v2.AiriAndroid"
            android:value="ai.moeru.airi.kirie.AiriAndroidPlugin" />
        <receiver
            android:name="ai.moeru.airi.kirie.AiriAndroidPlugin$NotificationReceiver"
            android:exported="false" />
        <activity
            android:name="ai.moeru.airi.kirie.AiriAndroidPlugin$DeepLinkActivity"
            android:exported="true"
            android:noHistory="true"
            android:theme="@android:style/Theme.Translucent.NoTitleBar">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="ai.moeru.airi-pocket"
                    android:host="links" />
            </intent-filter>
        </activity>
"""

func _get_android_manifest_element_contents(_platform: EditorExportPlatform, _debug: bool) -> String:
	return """
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
"""

func write_build_file(relative_path: String, content: String) -> void:
	var resource_path = ANDROID_BUILD_ROOT.path_join(relative_path)
	var absolute_path = ProjectSettings.globalize_path(resource_path)
	var directory_error = DirAccess.make_dir_recursive_absolute(absolute_path.get_base_dir())
	if directory_error != OK:
		push_error("Cannot prepare Android build directory: " + absolute_path.get_base_dir())
		return

	var file = FileAccess.open(absolute_path, FileAccess.WRITE)
	if file == null:
		push_error("Cannot write Android build file: " + absolute_path)
		return

	file.store_string(content)
