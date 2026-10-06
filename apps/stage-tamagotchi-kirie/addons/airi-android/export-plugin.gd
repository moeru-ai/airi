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
import android.content.ComponentCallbacks;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;
import android.webkit.WebView;

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
    private static final int BARCODE_SCAN_REQUEST = 112;
    private static final SignalInfo PERMISSION_RESULT =
        new SignalInfo("permission_result", String.class, Boolean.class);
    private static final int LIGHT_SYSTEM_BARS =
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
    private ComponentCallbacks configurationCallbacks;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WebView browserWebView;
    private final OSBARCController barcodeController = new OSBARCController();
    private final Map<String, PendingEventaRequest> pendingPermissionRequests =
        new HashMap<>();
    private PendingEventaRequest pendingBarcodeScan;
    private PendingNotificationSchedule pendingNotificationSchedule;

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
        browserWebView = null;
        pendingPermissionRequests.clear();
        pendingBarcodeScan = null;
        pendingNotificationSchedule = null;
    }

    @Override
    public void onMainActivityResult(int requestCode, int resultCode, Intent data) {
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
