package com.getcapacitor;

import android.app.Activity;
import android.content.Context;
import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContract;
import ai.moeru.airi.kirie.ProbeActivity;

// Only the reference client's external Activity and launcher boundaries use this fixture.
public final class Bridge {
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
