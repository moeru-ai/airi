package com.getcapacitor;

import android.app.Activity;
import android.content.Context;
import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContract;
import ai.moeru.airi.kirie.ProbeActivity;

// Only the reference client's external Activity and launcher boundaries use this fixture.
public final class Bridge {
    public static final String CAPACITOR_HTTPS_SCHEME = "https";
    public static final int DEFAULT_ANDROID_WEBVIEW_VERSION = 60;
    public static final int MINIMUM_ANDROID_WEBVIEW_VERSION = 55;
    public static final int DEFAULT_HUAWEI_WEBVIEW_VERSION = 10;
    public static final int MINIMUM_HUAWEI_WEBVIEW_VERSION = 10;
    private final ProbeActivity activity;
    public Bridge(ProbeActivity activity) { this.activity = activity; }
    public Activity getActivity() { return activity; }
    public Context getContext() { return activity; }
    public <I, O> ActivityResultLauncher<I> registerForActivityResult(
        ActivityResultContract<I, O> contract, ActivityResultCallback<O> callback
    ) {
        return activity.recordLauncher(contract, callback);
    }
}
