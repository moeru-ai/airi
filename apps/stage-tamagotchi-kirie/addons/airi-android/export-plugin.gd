@tool
extends EditorExportPlugin

const ANDROID_BUILD_ROOT = "res://android/build"
const POCKET_RESOURCES = "res://../stage-pocket/android/app/src/main/res"
const LAUNCH_MANIFEST = """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        tools:replace="android:allowBackup,android:icon" />
</manifest>
"""
const LAUNCH_RESOURCES = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AiriAppMainTheme" parent="GodotAppMainTheme">
        <item name="android:background">@null</item>
        <item name="android:windowBackground">@color/airi_startup_window_background</item>
    </style>
    <style name="AiriAppSplashTheme" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>
"""
const DAY_RESOURCES = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <bool name="airi_is_light_theme">true</bool>
    <color name="airi_system_bar_color">#FFFFFF</color>
    <color name="airi_startup_window_background">#FAFAFA</color>
</resources>
"""
const NIGHT_RESOURCES = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <bool name="airi_is_light_theme">false</bool>
    <color name="airi_system_bar_color">#303030</color>
    <color name="airi_startup_window_background">#303030</color>
</resources>
"""
const ANDROID_PLUGIN_SOURCE = """package ai.moeru.airi.kirie;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.ActivityNotFoundException;
import android.content.ComponentCallbacks;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.os.UserManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsetsController;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;

import com.outsystems.plugins.barcode.controller.OSBARCController;
import com.outsystems.plugins.barcode.model.OSBARCScanParameters;
import com.outsystems.plugins.barcode.model.OSBARCScannerHint;

import com.godot.game.R;

import org.godotengine.godot.Godot;
import org.godotengine.godot.plugin.GodotPlugin;
import org.godotengine.godot.plugin.SignalInfo;
import org.godotengine.godot.plugin.UsedByGodot;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import javax.security.auth.x500.X500Principal;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

import org.json.JSONException;
import org.json.JSONArray;
import org.json.JSONObject;

public final class AiriAndroidPlugin extends GodotPlugin {
    private interface PermissionListener {
        void onPermissionSelect(Boolean isGranted);
    }

    private interface ActivityResultListener {
        void onActivityResult(int resultCode, Intent data);
    }

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
    private static final String REGISTER_NOTIFICATION_ACTION_EVENT =
        "eventa:invoke:airi:android:notification:action-listener:register-send";
    private static final String UNREGISTER_NOTIFICATION_ACTION_EVENT =
        "eventa:invoke:airi:android:notification:action-listener:unregister-send";
    private static final String NOTIFICATION_ACTION_EVENT =
        "eventa:event:airi:android:notification:action-performed";
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
    private static final String NOTIFICATION_INTENT_ACTION =
        "LocalNotificationUserAction";
    private static final String NOTIFICATION_INTENT_ID = "LocalNotificationId";
    private static final String NOTIFICATION_INTENT_OBJECT = "LocalNotficationObject";
    private static final String NOTIFICATION_TAP_ACTION = "tap";
    private static final String NOTIFICATION_STORAGE = "NOTIFICATION_STORE";
    private static final String NOTIFICATIONS = "notifications";
    private static final String MICROPHONE = "microphone";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4101;
    private static final int MICROPHONE_PERMISSION_REQUEST = 4102;
    private static final int FILE_CHOOSER_REQUEST = 4103;
    private static final int BARCODE_SCAN_REQUEST = 112;
    private static final int NORMAL_WEB_SOCKET_CLOSE_CODE = 1000;
    private static final SignalInfo PERMISSION_RESULT =
        new SignalInfo("permission_result", String.class, Boolean.class);
    private static final int LIGHT_SYSTEM_BARS =
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
    private static AiriAndroidPlugin activePlugin;
    private static String pendingUrlOpen;
    private static final List<JSONObject> pendingNotificationActions = new ArrayList<>();
    private ComponentCallbacks configurationCallbacks;
    private OnBackPressedCallback backPressedCallback;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WebView browserWebView;
    private ViewGroup browserInsetsView;
    private ViewTreeObserver.OnGlobalLayoutListener browserImeLayoutListener;
    private int browserInsetsPaddingLeft;
    private int browserInsetsPaddingTop;
    private int browserInsetsPaddingRight;
    private int browserInsetsPaddingBottom;
    private HostWebSocketBridge hostWebSocketBridge;
    private final OSBARCController barcodeController = new OSBARCController();
    private final Map<String, PendingEventaRequest> pendingPermissionRequests =
        new HashMap<>();
    private PendingEventaRequest pendingBarcodeScan;
    private PendingNotificationSchedule pendingNotificationSchedule;
    // The picker and both capture modes share the last listener, including after completion.
    private ActivityResultListener activityListener;
    private JavaScriptReplyProxy eventaReplyProxy;
    private boolean notificationActionListenerRegistered;
    private ActivityResultLauncher<Intent> exactAlarmLauncher;
    private ActivityResultLauncher<String[]> permissionLauncher;
    // Keep one listener, including after completion, to match Capacitor 8.5.0.
    private PermissionListener permissionListener;

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
        createDefaultNotificationChannel(activity);
        receiveNotificationAction(activity, activity.getIntent());
        exactAlarmLauncher = ((ComponentActivity) activity).registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> completePendingNotificationSchedule()
        );
        permissionLauncher = ((ComponentActivity) activity).registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            isGranted -> {
                if (permissionListener != null) {
                    boolean granted = true;
                    for (Map.Entry<String, Boolean> permission : isGranted.entrySet()) {
                        if (!permission.getValue()) granted = false;
                    }
                    permissionListener.onPermissionSelect(granted);
                }
            }
        );
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
        backPressedCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                navigateBrowserBack();
            }
        };
        ((ComponentActivity) activity)
            .getOnBackPressedDispatcher()
            .addCallback(backPressedCallback);
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
        if (backPressedCallback != null) {
            backPressedCallback.remove();
            backPressedCallback = null;
        }
        mainHandler.removeCallbacksAndMessages(null);
        if (activePlugin == this) {
            activePlugin = null;
        }
        if (browserInsetsView != null) {
            ViewTreeObserver observer = browserInsetsView.getViewTreeObserver();
            if (browserImeLayoutListener != null && observer.isAlive()) {
                observer.removeOnGlobalLayoutListener(browserImeLayoutListener);
            }
            browserInsetsView.setPadding(
                browserInsetsPaddingLeft,
                browserInsetsPaddingTop,
                browserInsetsPaddingRight,
                browserInsetsPaddingBottom
            );
            browserInsetsView = null;
            browserImeLayoutListener = null;
        }
        if (hostWebSocketBridge != null) {
            hostWebSocketBridge.dispose();
            hostWebSocketBridge = null;
        }
        browserWebView = null;
        eventaReplyProxy = null;
        notificationActionListenerRegistered = false;
        pendingPermissionRequests.clear();
        pendingBarcodeScan = null;
        pendingNotificationSchedule = null;
    }

    @Override
    public void onMainActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST && activityListener != null) {
            activityListener.onActivityResult(resultCode, data);
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

        boolean runtimePermissionGranted = grantResults.length > 0
            && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        boolean granted = NOTIFICATIONS.equals(permission)
            ? checkPermission(permission)
            : runtimePermissionGranted;
        completePermissionRequest(permission, granted);
    }

    private void completePermissionRequest(String permission, boolean granted) {
        emitSignal(PERMISSION_RESULT, permission, granted);
        PendingEventaRequest pending = pendingPermissionRequests.remove(permission);
        if (pending != null) {
            sendPermissionEventaResponse(pending, granted);
        }
    }

    @Override
    public void onMainResume() {
        receiveNotificationAction(getActivity(), getActivity().getIntent());
        applySystemBarStyle(getActivity());
        dispatchPendingUrlOpen();
        dispatchPendingNotificationActions();
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

        if (NOTIFICATIONS.equals(permission)) {
            return notificationPermissionGranted(
                Build.VERSION.SDK_INT,
                activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS),
                NotificationManagerCompat.from(activity).areNotificationsEnabled()
            );
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

            if (NOTIFICATIONS.equals(permission)
                && (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    || activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED)) {
                completePermissionRequest(permission, false);
                return;
            }

            activity.requestPermissions(new String[] { androidPermission }, requestCode);
        });
    }

    private static boolean notificationPermissionGranted(
        int sdkInt,
        int runtimePermission,
        boolean notificationsEnabled
    ) {
        if (!notificationsEnabled) {
            return false;
        }
        return sdkInt < Build.VERSION_CODES.TIRAMISU
            || runtimePermission == PackageManager.PERMISSION_GRANTED;
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
            // NOTICE:
            // Transparent WebView tiles can disappear over the animated Godot surface.
            // An explicit hardware layer keeps WebView content in a dedicated GPU layer.
            // Context: Android onboarding input comparison on WebView 124.
            // Remove this after gd-kirie creates Android WebViews with a hardware layer.
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            installImeInsetHandler(activity);
            installExternalNavigation(activity, webView);
            hostWebSocketBridge = new HostWebSocketBridge(webView);
            webView.addJavascriptInterface(hostWebSocketBridge, "AiriHostBridge");
            webView.getSettings().setGeolocationEnabled(true);
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
            webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
            webView.getSettings().setDisplayZoomControls(false);
            webView.getSettings().setBuiltInZoomControls(false);
            webView.requestFocusFromTouch();
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onShowCustomView(View view, CustomViewCallback callback) {
                    callback.onCustomViewHidden();
                    super.onShowCustomView(view, callback);
                }

                @Override
                public void onHideCustomView() {
                    super.onHideCustomView();
                }

                @Override
                public boolean onJsAlert(
                    WebView source,
                    String url,
                    String message,
                    JsResult result
                ) {
                    if (activity.isFinishing()) {
                        return true;
                    }

                    AlertDialog.Builder builder = new AlertDialog.Builder(source.getContext());
                    builder
                        .setMessage(message)
                        .setPositiveButton("OK", (dialog, buttonIndex) -> {
                            dialog.dismiss();
                            result.confirm();
                        })
                        .setOnCancelListener(dialog -> {
                            dialog.dismiss();
                            result.cancel();
                        });

                    AlertDialog dialog = builder.create();
                    dialog.show();
                    return true;
                }

                @Override
                public boolean onJsConfirm(
                    WebView source,
                    String url,
                    String message,
                    JsResult result
                ) {
                    if (activity.isFinishing()) {
                        return true;
                    }

                    AlertDialog.Builder builder = new AlertDialog.Builder(source.getContext());
                    builder
                        .setMessage(message)
                        .setPositiveButton("OK", (dialog, buttonIndex) -> {
                            dialog.dismiss();
                            result.confirm();
                        })
                        .setNegativeButton("Cancel", (dialog, buttonIndex) -> {
                            dialog.dismiss();
                            result.cancel();
                        })
                        .setOnCancelListener(dialog -> {
                            dialog.dismiss();
                            result.cancel();
                        });

                    AlertDialog dialog = builder.create();
                    dialog.show();
                    return true;
                }

                @Override
                public boolean onJsPrompt(
                    WebView source,
                    String url,
                    String message,
                    String defaultValue,
                    JsPromptResult result
                ) {
                    if (activity.isFinishing()) {
                        return true;
                    }

                    AlertDialog.Builder builder = new AlertDialog.Builder(source.getContext());
                    EditText input = new EditText(source.getContext());
                    builder
                        .setMessage(message)
                        .setView(input)
                        .setPositiveButton("OK", (dialog, buttonIndex) -> {
                            dialog.dismiss();
                            String inputText = input.getText().toString().trim();
                            result.confirm(inputText);
                        })
                        .setNegativeButton("Cancel", (dialog, buttonIndex) -> {
                            dialog.dismiss();
                            result.cancel();
                        })
                        .setOnCancelListener(dialog -> {
                            dialog.dismiss();
                            result.cancel();
                        });

                    AlertDialog dialog = builder.create();
                    dialog.show();
                    return true;
                }

                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    List<String> permissionList = new ArrayList<>();
                    if (Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                        permissionList.add(Manifest.permission.CAMERA);
                    }
                    if (Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        permissionList.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);
                        permissionList.add(Manifest.permission.RECORD_AUDIO);
                    }
                    if (!permissionList.isEmpty()) {
                        String[] permissions = permissionList.toArray(new String[0]);
                        permissionListener = (isGranted) -> {
                            if (isGranted) {
                                request.grant(request.getResources());
                            } else {
                                request.deny();
                            }
                        };
                        permissionLauncher.launch(permissions);
                    } else {
                        request.grant(request.getResources());
                    }
                }

                @Override
                public void onGeolocationPermissionsShowPrompt(
                    String origin,
                    GeolocationPermissions.Callback callback
                ) {
                    super.onGeolocationPermissionsShowPrompt(origin, callback);
                    String[] permissions = {
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.ACCESS_FINE_LOCATION
                    };
                    if (!hasPermissions(activity, permissions)) {
                        permissionListener = isGranted -> {
                            if (isGranted) {
                                callback.invoke(origin, true, false);
                            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                                && hasPermissions(activity, new String[] {
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                })) {
                                callback.invoke(origin, true, false);
                            } else {
                                callback.invoke(origin, false, false);
                            }
                        };
                        permissionLauncher.launch(permissions);
                    } else {
                        callback.invoke(origin, true, false);
                    }
                }

                @Override
                public boolean onShowFileChooser(
                    WebView source,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams parameters
                ) {
                    List<String> acceptTypes = Arrays.asList(parameters.getAcceptTypes());
                    boolean captureEnabled = parameters.isCaptureEnabled();
                    boolean capturePhoto = captureEnabled && acceptTypes.contains("image/*");
                    boolean captureVideo = captureEnabled && acceptTypes.contains("video/*");
                    if (capturePhoto || captureVideo) {
                        if (isMediaCaptureSupported(activity)) {
                            showMediaCaptureOrFilePicker(activity, callback, parameters, captureVideo);
                        } else {
                            permissionListener = isGranted -> {
                                if (isGranted) {
                                    showMediaCaptureOrFilePicker(activity, callback, parameters, captureVideo);
                                } else {
                                    callback.onReceiveValue(null);
                                }
                            };
                            permissionLauncher.launch(new String[] { Manifest.permission.CAMERA });
                        }
                    } else {
                        showFilePicker(activity, callback, parameters);
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
        });
    }

    // NOTICE:
    // Kirie's overlay WebView ignores Android adjustResize.
    // The native view keeps its full height while the IME is visible.
    // Context: apps/stage-tamagotchi-kirie keyboard parity testing.
    // Remove this when gd-kirie's Android WebView consumes IME insets.
    private void installImeInsetHandler(Activity activity) {
        View contentView = activity.findViewById(android.R.id.content);
        if (!(contentView instanceof ViewGroup)) {
            return;
        }

        browserInsetsView = (ViewGroup) contentView;
        browserInsetsPaddingLeft = browserInsetsView.getPaddingLeft();
        browserInsetsPaddingTop = browserInsetsView.getPaddingTop();
        browserInsetsPaddingRight = browserInsetsView.getPaddingRight();
        browserInsetsPaddingBottom = browserInsetsView.getPaddingBottom();
        browserImeLayoutListener = () -> applyImeInsets(browserInsetsView);
        browserInsetsView.getViewTreeObserver().addOnGlobalLayoutListener(
            browserImeLayoutListener
        );
        browserInsetsView.post(() -> applyImeInsets(browserInsetsView));
    }

    private void applyImeInsets(ViewGroup view) {
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(view);
        if (insets == null) {
            return;
        }

        Insets imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime());
        Insets navigationInsets = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
        int keyboardInset = insets.isVisible(WindowInsetsCompat.Type.ime())
            ? Math.max(0, imeInsets.bottom - navigationInsets.bottom)
            : 0;
        int bottom = browserInsetsPaddingBottom + keyboardInset;
        if (view.getPaddingBottom() == bottom) {
            return;
        }
        view.setPadding(
            browserInsetsPaddingLeft,
            browserInsetsPaddingTop,
            browserInsetsPaddingRight,
            bottom
        );
    }

    private boolean hasPermissions(Activity activity, String[] permissions) {
        for (String permission : permissions) {
            if (ActivityCompat.checkSelfPermission(activity, permission)
                != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    private boolean isMediaCaptureSupported(Activity activity) {
        if (hasPermissions(activity, new String[] { Manifest.permission.CAMERA })) {
            return true;
        }
        String[] requestedPermissions = null;
        try {
            requestedPermissions = activity.getPackageManager().getPackageInfo(
                activity.getPackageName(), PackageManager.GET_PERMISSIONS
            ).requestedPermissions;
        } catch (Exception error) {
            // Capacitor's PermissionHelper treats an unavailable manifest as having no camera permission.
        }
        return requestedPermissions == null
            || !Arrays.asList(requestedPermissions).contains(Manifest.permission.CAMERA);
    }

    private void showMediaCaptureOrFilePicker(
        Activity activity,
        ValueCallback<Uri[]> callback,
        WebChromeClient.FileChooserParams parameters,
        boolean video
    ) {
        boolean shown = video
            ? showVideoCapturePicker(activity, callback)
            : showImageCapturePicker(activity, callback);
        if (!shown) {
            showFilePicker(activity, callback, parameters);
        }
    }

    private boolean showImageCapturePicker(Activity activity, ValueCallback<Uri[]> callback) {
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (intent.resolveActivity(activity.getPackageManager()) == null) {
            return false;
        }
        final Uri imageFileUri;
        try {
            String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
            File storageDir = activity.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            File photoFile = File.createTempFile("JPEG_" + timeStamp + "_", ".jpg", storageDir);
            imageFileUri = FileProvider.getUriForFile(
                activity, activity.getPackageName() + ".fileprovider", photoFile
            );
        } catch (Exception error) {
            Log.e("AiriAndroid", "Unable to create temporary media capture file", error);
            return false;
        }
        intent.putExtra(MediaStore.EXTRA_OUTPUT, imageFileUri);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        activityListener = (resultCode, data) -> {
            Uri[] result = null;
            if (resultCode == Activity.RESULT_OK) {
                result = new Uri[] { imageFileUri };
            }
            callback.onReceiveValue(result);
        };
        activity.startActivityForResult(intent, FILE_CHOOSER_REQUEST);
        return true;
    }

    private boolean showVideoCapturePicker(Activity activity, ValueCallback<Uri[]> callback) {
        Intent intent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
        if (intent.resolveActivity(activity.getPackageManager()) == null) {
            return false;
        }
        activityListener = (resultCode, data) -> {
            Uri[] result = null;
            if (resultCode == Activity.RESULT_OK) {
                result = new Uri[] { data.getData() };
            }
            callback.onReceiveValue(result);
        };
        activity.startActivityForResult(intent, FILE_CHOOSER_REQUEST);
        return true;
    }

    private void showFilePicker(
        Activity activity,
        ValueCallback<Uri[]> callback,
        WebChromeClient.FileChooserParams parameters
    ) {
        Intent intent = createFileChooserIntent(parameters);
        try {
            activityListener = (resultCode, data) -> {
                Uri[] result;
                if (resultCode == Activity.RESULT_OK && data.getClipData() != null) {
                    int itemCount = data.getClipData().getItemCount();
                    result = new Uri[itemCount];
                    for (int index = 0; index < itemCount; index += 1) {
                        result[index] = data.getClipData().getItemAt(index).getUri();
                    }
                } else {
                    result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                }
                callback.onReceiveValue(result);
            };
            activity.startActivityForResult(intent, FILE_CHOOSER_REQUEST);
        } catch (ActivityNotFoundException error) {
            callback.onReceiveValue(null);
        }
    }

    private Intent createFileChooserIntent(WebChromeClient.FileChooserParams parameters) {
        Intent intent = parameters.createIntent();
        if (parameters.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        if (parameters.getAcceptTypes().length > 1 || intent.getType().startsWith(".")) {
            String[] validTypes = getValidTypes(parameters.getAcceptTypes());
            intent.putExtra(Intent.EXTRA_MIME_TYPES, validTypes);
            if (intent.getType().startsWith(".")) {
                intent.setType(validTypes[0]);
            }
        }
        return intent;
    }

    private String[] getValidTypes(String[] currentTypes) {
        List<String> validTypes = new ArrayList<>();
        MimeTypeMap mtm = MimeTypeMap.getSingleton();
        for (String mime : currentTypes) {
            if (mime.startsWith(".")) {
                String extension = mime.substring(1);
                String extensionMime = mtm.getMimeTypeFromExtension(extension);
                if (extensionMime != null && !validTypes.contains(extensionMime)) {
                    validTypes.add(extensionMime);
                }
            } else if (!validTypes.contains(mime)) {
                validTypes.add(mime);
            }
        }
        Object[] validObj = validTypes.toArray();
        return Arrays.copyOf(validObj, validObj.length, String[].class);
    }

    private void installExternalNavigation(Activity activity, WebView webView) {
        // Kirie owns asset interception and development TLS handling.
        WebViewClient kirieClient = webView.getWebViewClient();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openExternalBrowser(activity, request.getUrl());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(
                WebView view,
                WebResourceRequest request
            ) {
                return kirieClient.shouldInterceptRequest(view, request);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                kirieClient.onReceivedSslError(view, handler, error);
            }
        });
    }

    private boolean openExternalBrowser(Activity activity, Uri uri) {
        if (uri.getScheme().equals("data") || uri.getScheme().equals("blob")) {
            return false;
        }
        Uri appUri = Uri.parse(EVENTA_ORIGIN);
        if (appUri.getHost().equals(uri.getHost()) && uri.getScheme().equals(appUri.getScheme())) {
            return false;
        }

        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            // Capacitor consumes the navigation even when no application handles the intent.
        }
        return true;
    }

    private void navigateBrowserBack() {
        WebView webView = browserWebView;
        if (webView == null) {
            return;
        }

        webView.post(() -> webView.evaluateJavascript(
            "window.__airiKirieAndroidBack?.()",
            null
        ));
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
                JSONObject notification = content.getJSONObject("notification");
                scheduleNotification(
                    new PendingEventaRequest(event, invokeId, replyProxy),
                    notification.getInt("id"),
                    notification.getString("title"),
                    notification.getString("body"),
                    content.getLong("at"),
                    notification.toString()
                );
                return;
            }
            if (REGISTER_NOTIFICATION_ACTION_EVENT.equals(event)) {
                notificationActionListenerRegistered = true;
                sendEventaResponse(
                    new PendingEventaRequest(event, invokeId, replyProxy),
                    consumePendingNotificationActions()
                );
                return;
            }
            if (UNREGISTER_NOTIFICATION_ACTION_EVENT.equals(event)) {
                notificationActionListenerRegistered = false;
                sendEventaResponse(
                    new PendingEventaRequest(event, invokeId, replyProxy),
                    JSONObject.NULL
                );
                return;
            }
            if (OPEN_AUTHORIZATION_EVENT.equals(event)) {
                openAuthorization(
                    content.optString("url", ""),
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
        if (url == null || url.trim().isEmpty()) {
            rejectAuthorization(
                request,
                "INVALID_URL",
                "The authentication URL is missing."
            );
            return;
        }

        Activity activity = getActivity();
        Uri uri = Uri.parse(url);
        if (activity == null
            || uri.getScheme() == null
            || !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))) {
            Log.e("AiriAndroid", "Cannot open an invalid authorization URL");
            rejectAuthorization(
                request,
                "INVALID_URL",
                "The authentication URL is invalid."
            );
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (RuntimeException error) {
                Log.e("AiriAndroid", "No browser can open the authorization URL", error);
                rejectAuthorization(
                    request,
                    "BROWSER_UNAVAILABLE",
                    "No browser can open the authentication URL."
                );
                return;
            }
            sendEventaResponse(request, JSONObject.NULL);
        });
    }

    private void rejectAuthorization(
        PendingEventaRequest request,
        String code,
        String message
    ) {
        try {
            sendEventaError(request, new JSONObject()
                .put("code", code)
                .put("message", message));
        } catch (JSONException error) {
            Log.e("AiriAndroid", "Cannot create authorization error", error);
        }
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
        long at,
        String notificationPayload
    ) {
        Activity activity = getActivity();
        if (activity == null) {
            return;
        }

        NotificationManager notificationManager = activity.getSystemService(
            NotificationManager.class
        );
        if (!notificationManager.areNotificationsEnabled()) {
            sendEventaError(
                request,
                "Notifications are not enabled on this device."
            );
            return;
        }

        AlarmManager alarmManager = activity.getSystemService(AlarmManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && !alarmManager.canScheduleExactAlarms()) {
            pendingNotificationSchedule = new PendingNotificationSchedule(
                request,
                id,
                title,
                body,
                at,
                notificationPayload
            );
            activity.runOnUiThread(() -> exactAlarmLauncher.launch(
                new Intent(
                    Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + activity.getPackageName())
                )
            ));
            return;
        }

        scheduleNotificationAlarm(
            activity,
            alarmManager,
            id,
            title,
            body,
            at,
            notificationPayload
        );
        sendEventaResponse(request, JSONObject.NULL);
    }

    private void completePendingNotificationSchedule() {
        Activity activity = getActivity();
        PendingNotificationSchedule schedule = pendingNotificationSchedule;
        if (activity == null || schedule == null) {
            return;
        }

        pendingNotificationSchedule = null;
        scheduleNotificationAlarm(
            activity,
            activity.getSystemService(AlarmManager.class),
            schedule.id,
            schedule.title,
            schedule.body,
            schedule.at,
            schedule.notificationPayload
        );
        sendEventaResponse(schedule.request, JSONObject.NULL);
    }

    private static void scheduleNotificationAlarm(
        Context context,
        AlarmManager alarmManager,
        int id,
        String title,
        String body,
        long at,
        String notificationPayload
    ) {
        Intent intent = new Intent(context, NotificationReceiver.class)
            .setAction(NOTIFICATION_ACTION)
            .putExtra(NOTIFICATION_EXTRA_ID, id)
            .putExtra(NOTIFICATION_EXTRA_TITLE, title)
            .putExtra(NOTIFICATION_EXTRA_BODY, body)
            .putExtra(NOTIFICATION_INTENT_OBJECT, notificationPayload);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            || alarmManager.canScheduleExactAlarms()) {
            alarmManager.setExact(AlarmManager.RTC, at, pendingIntent);
        } else {
            alarmManager.set(AlarmManager.RTC, at, pendingIntent);
        }
        persistScheduledNotification(context, id, title, body, at, notificationPayload);
    }

    private static void persistScheduledNotification(
        Context context,
        int id,
        String title,
        String body,
        long at,
        String notificationPayload
    ) {
        try {
            JSONObject notification = new JSONObject()
                .put(NOTIFICATION_EXTRA_ID, id)
                .put(NOTIFICATION_EXTRA_TITLE, title)
                .put(NOTIFICATION_EXTRA_BODY, body)
                .put("at", at)
                .put(NOTIFICATION_INTENT_OBJECT, notificationPayload);
            context.getSharedPreferences(NOTIFICATION_STORAGE, Context.MODE_PRIVATE)
                .edit()
                .putString(Integer.toString(id), notification.toString())
                .apply();
        } catch (JSONException error) {
            Log.e("AiriAndroid", "Cannot persist scheduled notification", error);
        }
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

    private void sendEventaError(PendingEventaRequest request, Object error) {
        try {
            String responseEvent = request.event.replace("-send", "-receive-error")
                + "-" + request.invokeId;
            JSONObject body = new JSONObject()
                .put("invokeId", request.invokeId)
                .put("content", new JSONObject().put("error", error));
            JSONObject payload = new JSONObject().put("body", body);
            JSONObject envelope = new JSONObject()
                .put("type", responseEvent)
                .put("payload", payload);
            request.replyProxy.postMessage(envelope.toString());
        } catch (JSONException jsonError) {
            Log.e("AiriAndroid", "Cannot send Eventa error", jsonError);
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

    private static void receiveNotificationAction(Context context, Intent intent) {
        if (context == null || intent == null || !Intent.ACTION_MAIN.equals(intent.getAction())) {
            return;
        }

        int id = intent.getIntExtra(NOTIFICATION_INTENT_ID, Integer.MIN_VALUE);
        if (id == Integer.MIN_VALUE) {
            return;
        }

        String notificationPayload = intent.getStringExtra(NOTIFICATION_INTENT_OBJECT);
        try {
            JSONObject action = new JSONObject()
                .put("actionId", intent.getStringExtra(NOTIFICATION_INTENT_ACTION));
            if (notificationPayload == null) {
                action.put("notification", JSONObject.NULL);
            } else {
                action.put("notification", new JSONObject(notificationPayload));
            }
            synchronized (pendingNotificationActions) {
                pendingNotificationActions.add(action);
            }
        } catch (JSONException error) {
            try {
                synchronized (pendingNotificationActions) {
                    pendingNotificationActions.add(
                        new JSONObject()
                            .put("actionId", intent.getStringExtra(NOTIFICATION_INTENT_ACTION))
                            .put("notification", JSONObject.NULL)
                    );
                }
            } catch (JSONException fallbackError) {
                Log.e("AiriAndroid", "Cannot retain notification action", fallbackError);
            }
        }

        forgetTappedNotification(context, id);
        intent.removeExtra(NOTIFICATION_INTENT_ID);
        intent.removeExtra(NOTIFICATION_INTENT_ACTION);
        intent.removeExtra(NOTIFICATION_INTENT_OBJECT);

        if (activePlugin != null) {
            activePlugin.dispatchPendingNotificationActions();
        }
    }

    private static void forgetTappedNotification(Context context, int id) {
        SharedPreferences storage = context.getSharedPreferences(
            NOTIFICATION_STORAGE,
            Context.MODE_PRIVATE
        );
        String key = Integer.toString(id);
        String savedNotification;
        try {
            savedNotification = storage.getString(key, null);
        } catch (ClassCastException error) {
            savedNotification = null;
        }

        boolean safeToForget = true;
        if (savedNotification != null) {
            try {
                safeToForget = new JSONObject(savedNotification).getLong("at")
                    <= System.currentTimeMillis();
            } catch (JSONException error) {
                safeToForget = true;
            }
        }
        if (safeToForget) {
            storage.edit().remove(key).apply();
        }
    }

    private JSONObject consumePendingNotificationActions() throws JSONException {
        JSONArray actions = new JSONArray();
        synchronized (pendingNotificationActions) {
            for (JSONObject action : pendingNotificationActions) {
                actions.put(action);
            }
            pendingNotificationActions.clear();
        }
        return new JSONObject().put("actions", actions);
    }

    private void dispatchPendingNotificationActions() {
        JavaScriptReplyProxy replyProxy = eventaReplyProxy;
        if (!notificationActionListenerRegistered || replyProxy == null) {
            return;
        }

        while (true) {
            JSONObject action;
            synchronized (pendingNotificationActions) {
                if (pendingNotificationActions.isEmpty()) {
                    return;
                }
                action = pendingNotificationActions.get(0);
            }
            try {
                JSONObject payload = new JSONObject().put("body", action);
                JSONObject envelope = new JSONObject()
                    .put("type", NOTIFICATION_ACTION_EVENT)
                    .put("payload", payload);
                replyProxy.postMessage(envelope.toString());
                synchronized (pendingNotificationActions) {
                    pendingNotificationActions.remove(action);
                }
            } catch (JSONException error) {
                Log.e("AiriAndroid", "Cannot send notification action", error);
                return;
            }
        }
    }

    private static Intent configureNotificationLaunchIntent(
        Intent launchIntent,
        int id,
        String notificationPayload
    ) {
        launchIntent.setAction(Intent.ACTION_MAIN);
        launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launchIntent.putExtra(NOTIFICATION_INTENT_ID, id);
        launchIntent.putExtra(NOTIFICATION_INTENT_ACTION, NOTIFICATION_TAP_ACTION);
        launchIntent.putExtra(NOTIFICATION_INTENT_OBJECT, notificationPayload);
        return launchIntent;
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
        private final String notificationPayload;

        private PendingNotificationSchedule(
            PendingEventaRequest request,
            int id,
            String title,
            String body,
            long at,
            String notificationPayload
        ) {
            this.request = request;
            this.id = id;
            this.title = title;
            this.body = body;
            this.at = at;
            this.notificationPayload = notificationPayload;
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
            NotificationManager manager = createDefaultNotificationChannel(context);
            Intent launchIntent = configureNotificationLaunchIntent(
                context.getPackageManager().getLaunchIntentForPackage(context.getPackageName()),
                id,
                intent.getStringExtra(NOTIFICATION_INTENT_OBJECT)
            );
            PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                id,
                launchIntent,
                PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_MUTABLE
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

    private static NotificationManager createDefaultNotificationChannel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Default",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Default");
            manager.createNotificationChannel(channel);
        }
        return manager;
    }

    public static final class NotificationRestoreReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            UserManager userManager = context.getSystemService(UserManager.class);
            if (userManager == null || !userManager.isUserUnlocked()) {
                return;
            }

            long now = System.currentTimeMillis();
            SharedPreferences storage = context.getSharedPreferences(
                NOTIFICATION_STORAGE,
                Context.MODE_PRIVATE
            );
            AlarmManager alarmManager = context.getSystemService(AlarmManager.class);
            for (Map.Entry<String, ?> entry : storage.getAll().entrySet()) {
                if (!(entry.getValue() instanceof String)) {
                    continue;
                }

                try {
                    JSONObject notification = new JSONObject((String) entry.getValue());
                    long at = notification.getLong("at");
                    if (at <= now) {
                        continue;
                    }
                    scheduleNotificationAlarm(
                        context,
                        alarmManager,
                        notification.getInt(NOTIFICATION_EXTRA_ID),
                        notification.getString(NOTIFICATION_EXTRA_TITLE),
                        notification.getString(NOTIFICATION_EXTRA_BODY),
                        at,
                        notification.getString(NOTIFICATION_INTENT_OBJECT)
                    );
                } catch (JSONException error) {
                    Log.e("AiriAndroid", "Cannot restore scheduled notification", error);
                }
            }
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

    private static OkHttpClient createHostWebSocketClient() {
        try {
            X509TrustManager trustManager = new AiriHostWebSocketTrustManager();
            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, new TrustManager[] { trustManager }, new SecureRandom());
            return new OkHttpClient.Builder()
                .sslSocketFactory(sslContext.getSocketFactory(), trustManager)
                .build();
        } catch (Exception error) {
            throw new IllegalStateException("Cannot create the host WebSocket client", error);
        }
    }

    private static X509TrustManager createPlatformTrustManager() {
        try {
            TrustManagerFactory factory = TrustManagerFactory.getInstance(
                TrustManagerFactory.getDefaultAlgorithm()
            );
            factory.init((KeyStore) null);
            for (TrustManager manager : factory.getTrustManagers()) {
                if (manager instanceof X509TrustManager) {
                    return (X509TrustManager) manager;
                }
            }
        } catch (Exception error) {
            throw new IllegalStateException("Cannot create the platform trust manager", error);
        }
        throw new IllegalStateException("The platform trust manager is unavailable");
    }

    private static boolean looksLikeAiriServerCertificate(X509Certificate certificate) {
        X500Principal subject = certificate.getSubjectX500Principal();
        X500Principal issuer = certificate.getIssuerX500Principal();
        return "localhost".equals(principalAttribute(subject, "CN"))
            && "AIRI".equals(principalAttribute(issuer, "CN"))
            && "US".equals(principalAttribute(issuer, "C"))
            && "Local".equals(principalAttribute(issuer, "L"))
            && "AIRI".equals(principalAttribute(issuer, "O"));
    }

    private static String principalAttribute(X500Principal principal, String key) {
        String[] entries = principal.getName().split(",");
        for (String entry : entries) {
            String[] parts = entry.trim().split("=", 2);
            if (parts.length == 2 && key.equalsIgnoreCase(parts[0])) {
                return parts[1];
            }
        }
        return null;
    }

    private static final class AiriHostWebSocketTrustManager implements X509TrustManager {
        private final X509TrustManager platformTrustManager = createPlatformTrustManager();

        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType)
            throws CertificateException {
            platformTrustManager.checkClientTrusted(chain, authType);
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType)
            throws CertificateException {
            try {
                platformTrustManager.checkServerTrusted(chain, authType);
            } catch (CertificateException error) {
                X509Certificate leaf = chain.length == 0 ? null : chain[0];
                if (leaf == null || !looksLikeAiriServerCertificate(leaf)) {
                    throw error;
                }
                leaf.checkValidity();
            }
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return platformTrustManager.getAcceptedIssuers();
        }
    }

    private static final class HostWebSocketBridge {
        private final OkHttpClient client = createHostWebSocketClient();
        private final Map<String, WebSocket> sessions = new ConcurrentHashMap<>();
        private final WebView webView;

        private HostWebSocketBridge(WebView webView) {
            this.webView = webView;
        }

        @JavascriptInterface
        public void postMessage(String payload) {
            try {
                JSONObject command = new JSONObject(payload);
                String kind = command.getString("kind");
                if ("connect".equals(kind)) {
                    connect(command.getString("id"), command.getString("url"));
                    return;
                }
                if ("send".equals(kind)) {
                    WebSocket socket = sessions.get(command.getString("id"));
                    if (socket != null) {
                        socket.send(command.getString("data"));
                    }
                    return;
                }
                if ("close".equals(kind)) {
                    WebSocket socket = sessions.get(command.getString("id"));
                    if (socket != null) {
                        int code = command.has("code") && !command.isNull("code")
                            ? command.getInt("code")
                            : NORMAL_WEB_SOCKET_CLOSE_CODE;
                        String reason = command.has("reason") && !command.isNull("reason")
                            ? command.getString("reason")
                            : null;
                        socket.close(code, reason);
                    }
                }
            } catch (Exception error) {
                Log.e("AiriAndroid", "Cannot handle host WebSocket command", error);
            }
        }

        private void connect(String id, String url) {
            try {
                WebSocket socket = client.newWebSocket(
                    new Request.Builder().url(url).build(),
                    new WebSocketListener() {
                        @Override
                        public void onOpen(WebSocket socket, Response response) {
                            emit(createEvent("open", id));
                        }

                        @Override
                        public void onMessage(WebSocket socket, String text) {
                            emit(addEventValue(createEvent("message", id), "data", text));
                        }

                        @Override
                        public void onClosing(WebSocket socket, int code, String reason) {
                            socket.close(code, reason);
                        }

                        @Override
                        public void onClosed(WebSocket socket, int code, String reason) {
                            sessions.remove(id);
                            JSONObject close = createEvent("close", id);
                            addEventValue(close, "code", code);
                            addEventValue(close, "reason", reason);
                            emit(close);
                        }

                        @Override
                        public void onFailure(WebSocket socket, Throwable error, Response response) {
                            String message = error.getMessage() == null
                                ? "WebSocket failure"
                                : error.getMessage();
                            emit(addEventValue(createEvent("error", id), "message", message));
                            JSONObject close = addEventValue(
                                createEvent("close", id),
                                "reason",
                                error.getMessage()
                            );
                            if (response != null) {
                                addEventValue(close, "code", response.code());
                            }
                            sessions.remove(id);
                            emit(close);
                        }
                    }
                );
                sessions.put(id, socket);
            } catch (Exception error) {
                String message = error.getMessage() == null
                    ? "Failed to create websocket session"
                    : error.getMessage();
                emit(addEventValue(createEvent("error", id), "message", message));
                emit(addEventValue(createEvent("close", id), "reason", message));
            }
        }

        private JSONObject createEvent(String kind, String id) {
            JSONObject event = new JSONObject();
            addEventValue(event, "kind", kind);
            addEventValue(event, "id", id);
            return event;
        }

        private JSONObject addEventValue(JSONObject event, String key, Object value) {
            try {
                return event.put(key, value);
            } catch (JSONException error) {
                throw new IllegalStateException("Cannot create host WebSocket event", error);
            }
        }

        private void emit(JSONObject event) {
            String payload = event.toString();
            webView.post(() -> webView.evaluateJavascript(
                "window.__airiHostBridge?.onNativeMessage(" + JSONObject.quote(payload) + ")",
                null
            ));
        }

        private void dispose() {
            for (WebSocket socket : sessions.values()) {
                socket.close(NORMAL_WEB_SOCKET_CLOSE_CODE, "Bridge disposed");
            }
            sessions.clear();
        }
    }
}
"""

func _get_name() -> String:
	return "AiriAndroid"

func _supports_platform(platform: EditorExportPlatform) -> bool:
	return platform.get_os_name().to_lower() == "android"

func _get_android_dependencies(_platform: EditorExportPlatform, _debug: bool) -> PackedStringArray:
	return PackedStringArray([
		"androidx.core:core-splashscreen:1.2.0",
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
		"com.squareup.okhttp3:okhttp:4.12.0",
	])

func _export_begin(features: PackedStringArray, _is_debug: bool, _path: String, _flags: int) -> void:
	if not features.has("android"):
		return

	enable_cleartext_traffic()
	configure_launch_task()
	configure_activity_recreation()
	configure_launch_resources()
	configure_launch_activity()
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
        <receiver
            android:name="ai.moeru.airi.kirie.AiriAndroidPlugin$NotificationRestoreReceiver"
            android:directBootAware="true"
            android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.LOCKED_BOOT_COMPLETED" />
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
            </intent-filter>
        </receiver>
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
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
"""


func enable_cleartext_traffic() -> void:
	# NOTICE:
	# Godot's export plugin API cannot add an Android application attribute.
	# stage-pocket permits cleartext WebSocket connections for local server channels.
	# Source: apps/stage-pocket/android/app/src/main/AndroidManifest.xml.
	# Remove this rewrite when Godot exposes application attributes to export plugins.
	var relative_path = "src/main/AndroidManifest.xml"
	var absolute_path = ProjectSettings.globalize_path(ANDROID_BUILD_ROOT.path_join(relative_path))
	var content = FileAccess.get_file_as_string(absolute_path)
	var application_tag = "    <application\n"
	if not content.contains("android:usesCleartextTraffic"):
		content = content.replace(
			application_tag,
			application_tag + "        android:usesCleartextTraffic=\"true\"\n"
		)
	if not content.contains("tools:replace=\"android:usesCleartextTraffic\""):
		content = content.replace(
			application_tag,
			application_tag + "        tools:replace=\"android:usesCleartextTraffic\"\n"
		)
	write_build_file(relative_path, content)

	var debug_relative_path = "src/debug/AndroidManifest.xml"
	var debug_absolute_path = ProjectSettings.globalize_path(
		ANDROID_BUILD_ROOT.path_join(debug_relative_path)
	)
	var debug_content = FileAccess.get_file_as_string(debug_absolute_path)
	var tools_replace = "tools:replace=\"android:allowBackup,"
	if not debug_content.contains("tools:replace=\"android:usesCleartextTraffic,"):
		debug_content = debug_content.replace(
			tools_replace,
			"tools:replace=\"android:usesCleartextTraffic,android:allowBackup,"
		)
	write_build_file(debug_relative_path, debug_content)


func configure_launch_task() -> void:
	# NOTICE:
	# Godot exports its main activity with singleInstancePerTask.
	# stage-pocket uses singleTask for its main activity.
	# Source: apps/stage-pocket/android/app/src/main/AndroidManifest.xml.
	# Remove this rewrite when Godot exports a configurable activity launch mode.
	var relative_path = "src/main/AndroidManifest.xml"
	var absolute_path = ProjectSettings.globalize_path(ANDROID_BUILD_ROOT.path_join(relative_path))
	var content = FileAccess.get_file_as_string(absolute_path)
	content = content.replace(
		"android:launchMode=\"singleInstancePerTask\"",
		"android:launchMode=\"singleTask\""
	)
	write_build_file(relative_path, content)


func configure_activity_recreation() -> void:
	# NOTICE:
	# Godot handles layout-direction changes inside its existing activity and quits on activity destruction.
	# stage-pocket lets Android recreate its main activity for that configuration change.
	# Source: stage-pocket's manifest and GodotActivity's onGodotForceQuit implementation.
	# Remove this rewrite when Godot supports activity recreation without quitting its process.
	var relative_path = "src/main/AndroidManifest.xml"
	var absolute_path = ProjectSettings.globalize_path(ANDROID_BUILD_ROOT.path_join(relative_path))
	var content = FileAccess.get_file_as_string(absolute_path)
	content = content.replace(
		"android:configChanges=\"layoutDirection|",
		"android:configChanges=\""
	)
	write_build_file(relative_path, content)

	var activity_path = "src/main/java/com/godot/game/GodotApp.java"
	var activity = FileAccess.get_file_as_string(
		ProjectSettings.globalize_path(ANDROID_BUILD_ROOT.path_join(activity_path))
	)
	if not activity.contains("\tprivate boolean changingConfigurations;\n"):
		activity = activity.replace(
			"public class GodotApp extends GodotActivity {\n",
			"public class GodotApp extends GodotActivity {\n\tprivate boolean changingConfigurations;\n"
		)
	if not activity.contains("\t\tchangingConfigurations = isChangingConfigurations();\n"):
		activity = activity.replace(
			"\n\t@Override\n\tpublic void onGodotForceQuit(Godot instance) {",
			"\n\t@Override\n\tprotected void onDestroy() {\n\t\tchangingConfigurations = isChangingConfigurations();\n\t\tsuper.onDestroy();\n\t}\n\n\t@Override\n\tpublic void onGodotForceQuit(Godot instance) {"
		)
	activity = activity.replace(
		"\t\tif (!changingConfigurations && !BuildConfig.FLAVOR.equals(\"instrumented\")) {",
		"\t\tif (changingConfigurations) {\n\t\t\torg.godotengine.godot.utils.ProcessPhoenix.triggerRebirth(this);\n\t\t} else if (!BuildConfig.FLAVOR.equals(\"instrumented\")) {"
	)
	activity = activity.replace(
		"\t\tif (!BuildConfig.FLAVOR.equals(\"instrumented\")) {",
		"\t\tif (changingConfigurations) {\n\t\t\torg.godotengine.godot.utils.ProcessPhoenix.triggerRebirth(this);\n\t\t} else if (!BuildConfig.FLAVOR.equals(\"instrumented\")) {"
	)
	write_build_file(activity_path, activity)


func configure_launch_resources() -> void:
	# NOTICE:
	# Godot's DeviceDefault parent gives native WebView dialogs a different theme from stage-pocket.
	# Godot exposes custom theme items but no main-theme parent option.
	# Source: stage-pocket styles.xml and Godot platform/android/export/export_plugin.cpp::_fix_themes_xml.
	# When Godot exposes the main-theme parent, remove this rewrite.
	var theme_path = "res/values/themes.xml"
	var theme = FileAccess.get_file_as_string(
		ProjectSettings.globalize_path(ANDROID_BUILD_ROOT.path_join(theme_path))
	)
	theme = theme.replace(
		"<style name=\"GodotAppMainTheme\" parent=\"@android:style/Theme.DeviceDefault.NoActionBar\">",
		"<style name=\"GodotAppMainTheme\" parent=\"Theme.AppCompat.DayNight.NoActionBar\">"
	)
	write_build_file(theme_path, theme)

	# NOTICE:
	# Godot regenerates its splash theme with a fixed background and its own icon during export.
	# stage-pocket uses the AndroidX theme defaults and the application launcher icon on Android 12 and later.
	# Godot also regenerates build-type manifests with its application icon after export plugins run.
	# Source: Godot platform/android/export/export_plugin.cpp and Android manifest merge priorities.
	# When Godot supports launch themes and activity icons in export presets, remove this manifest rewrite.
	var manifest_path = "src/main/AndroidManifest.xml"
	var manifest = FileAccess.get_file_as_string(
		ProjectSettings.globalize_path(ANDROID_BUILD_ROOT.path_join(manifest_path))
	)
	manifest = manifest.replace("@style/GodotAppSplashTheme", "@style/AiriAppSplashTheme")
	manifest = manifest.replace(
		"android:icon=\"@mipmap/icon\"",
		"android:icon=\"@mipmap/ic_launcher\"\n        android:roundIcon=\"@mipmap/ic_launcher_round\""
	)
	manifest = manifest.replace(
		"android:name=\".GodotApp\"\n            android:theme",
		"android:name=\".GodotApp\"\n            android:icon=\"@mipmap/ic_launcher\"\n            android:theme"
	)
	manifest = manifest.replace(
		"android:name=\".GodotAppLauncher\"\n            android:targetActivity",
		"android:name=\".GodotAppLauncher\"\n            android:icon=\"@mipmap/ic_launcher\"\n            android:targetActivity"
	)
	write_build_file(manifest_path, manifest)
	for edition in ["standard", "mono", "instrumented"]:
		for build_type in ["Debug", "Release"]:
			write_build_file("src/" + edition + build_type + "/AndroidManifest.xml", LAUNCH_MANIFEST)
	write_build_file("res/values/airi-launch.xml", LAUNCH_RESOURCES)

	var source_root = ProjectSettings.globalize_path(POCKET_RESOURCES)
	for directory in DirAccess.get_directories_at(source_root):
		for filename in DirAccess.get_files_at(source_root.path_join(directory)):
			if filename != "splash.png" and not filename.begins_with("ic_launcher"):
				continue
			var relative_path = directory.path_join(filename)
			var destination = ProjectSettings.globalize_path(
				ANDROID_BUILD_ROOT.path_join("res").path_join(relative_path)
			)
			var directory_error = DirAccess.make_dir_recursive_absolute(destination.get_base_dir())
			if directory_error != OK:
				push_error("Cannot prepare Android launch resource directory: " + destination.get_base_dir())
				return
			var copy_error = DirAccess.copy_absolute(source_root.path_join(relative_path), destination)
			if copy_error != OK:
				push_error("Cannot copy Android launch resource: " + relative_path)
				return


func configure_launch_activity() -> void:
	# NOTICE:
	# Godot retains the native splash until its main loop starts and leaves the launch background in the activity theme.
	# Capacitor switches application and activity themes without installing an AndroidX splash or adding a keep-on-screen condition.
	# Source: Godot 4.7.2 GodotApp.java::onCreate and Capacitor 8.3.1 BridgeActivity.java::onCreate.
	# When Godot exposes native splash lifecycle configuration, remove this template rewrite.
	var activity_path = "src/main/java/com/godot/game/GodotApp.java"
	var activity = FileAccess.get_file_as_string(
		ProjectSettings.globalize_path(ANDROID_BUILD_ROOT.path_join(activity_path))
	)
	activity = activity.replace("import androidx.core.splashscreen.SplashScreen;\n", "")
	activity = activity.replace(
		"\t\tSplashScreen splashScreen = SplashScreen.installSplashScreen(this);",
		"\t\tgetApplication().setTheme(R.style.AiriAppMainTheme);\n\t\tsetTheme(R.style.AiriAppMainTheme);"
	)
	activity = activity.replace(
		"\n\t\tGodot godot = getGodot();\n\t\tif (godot != null && godot.getDisableGodotSplash()) {\n\t\t\tsplashScreen.setKeepOnScreenCondition(() -> godot.getRunStatus() != Godot.RunStatus.STARTED);\n\t\t}\n",
		"\n"
	)
	write_build_file(activity_path, activity)


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
