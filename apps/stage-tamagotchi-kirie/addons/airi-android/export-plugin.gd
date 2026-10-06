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
import android.Manifest;
import android.content.ComponentCallbacks;
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
    private static final String NOTIFICATIONS = "notifications";
    private static final String MICROPHONE = "microphone";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4101;
    private static final int MICROPHONE_PERMISSION_REQUEST = 4102;
    private static final SignalInfo PERMISSION_RESULT =
        new SignalInfo("permission_result", String.class, Boolean.class);
    private static final int LIGHT_SYSTEM_BARS =
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
    private ComponentCallbacks configurationCallbacks;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WebView browserWebView;
    private final Map<String, PendingPermissionRequest> pendingPermissionRequests =
        new HashMap<>();

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
        PendingPermissionRequest pending = pendingPermissionRequests.remove(permission);
        if (pending != null) {
            sendPermissionEventaResponse(pending, granted);
        }
    }

    @Override
    public void onMainResume() {
        applySystemBarStyle(getActivity());
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
            String permission = body.getJSONObject("content").getString("permission");

            if (CHECK_PERMISSION_EVENT.equals(event)) {
                sendEventaResponse(
                    new PendingPermissionRequest(event, invokeId, replyProxy),
                    new JSONObject().put("granted", checkPermission(permission))
                );
                return;
            }
            if (REQUEST_PERMISSION_EVENT.equals(event)) {
                if (checkPermission(permission)) {
                    sendEventaResponse(
                        new PendingPermissionRequest(event, invokeId, replyProxy),
                        new JSONObject().put("granted", true)
                    );
                    return;
                }

                pendingPermissionRequests.put(
                    permission,
                    new PendingPermissionRequest(event, invokeId, replyProxy)
                );
                requestPermission(permission);
                return;
            }
            if (OPEN_PERMISSION_SETTINGS_EVENT.equals(event)) {
                openPermissionSettings(permission);
                sendEventaResponse(
                    new PendingPermissionRequest(event, invokeId, replyProxy),
                    JSONObject.NULL
                );
            }
        } catch (JSONException error) {
            Log.e("AiriAndroid", "Cannot handle Eventa message", error);
        }
    }

    private void sendEventaResponse(PendingPermissionRequest request, Object content) {
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
        PendingPermissionRequest request,
        boolean granted
    ) {
        try {
            sendEventaResponse(request, new JSONObject().put("granted", granted));
        } catch (JSONException error) {
            Log.e("AiriAndroid", "Cannot create permission response", error);
        }
    }

    private static final class PendingPermissionRequest {
        private final String event;
        private final String invokeId;
        private final JavaScriptReplyProxy replyProxy;

        private PendingPermissionRequest(
            String event,
            String invokeId,
            JavaScriptReplyProxy replyProxy
        ) {
            this.event = event;
            this.invokeId = invokeId;
            this.replyProxy = replyProxy;
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
