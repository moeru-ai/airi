package ai.moeru.airi.kirie;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContract;
import androidx.core.app.ActivityOptionsCompat;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class ProbeActivity extends ComponentActivity {
    public WebView webView;
    public FrameLayout host;
    public final Map<String, Integer> permissions = new HashMap<>();
    public final List<Intent> intents = new ArrayList<>();
    public final List<RecordingLauncher<?, ?>> launchers = new ArrayList<>();
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        host = new FrameLayout(this);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        host.addView(webView);
        setContentView(host);
    }
    @Override public int checkSelfPermission(String permission) {
        return permissions.getOrDefault(permission, PackageManager.PERMISSION_DENIED);
    }
    @Override public int checkPermission(String permission, int pid, int uid) {
        return checkSelfPermission(permission);
    }
    @Override public void startActivityForResult(Intent intent, int requestCode) {
        intents.add(intent);
    }
    public <I, O> RecordingLauncher<I, O> recordLauncher(
        ActivityResultContract<I, O> contract, ActivityResultCallback<O> callback
    ) {
        RecordingLauncher<I, O> launcher = new RecordingLauncher<>(contract, callback);
        launchers.add(launcher);
        return launcher;
    }
    public static final class RecordingLauncher<I, O> extends ActivityResultLauncher<I> {
        public final List<I> inputs = new ArrayList<>();
        private final ActivityResultContract<I, O> contract;
        private final ActivityResultCallback<O> callback;
        RecordingLauncher(ActivityResultContract<I, O> contract, ActivityResultCallback<O> callback) {
            this.contract = contract;
            this.callback = callback;
        }
        @Override public void launch(I input, ActivityOptionsCompat options) { inputs.add(input); }
        @Override public void unregister() {}
        @Override public ActivityResultContract<I, ?> getContract() { return contract; }
        public void deliver(O value) { callback.onActivityResult(value); }
    }
}
