package ai.moeru.airi.kirie;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import ai.moeru.kirie.android.KirieAndroidPlugin;
import androidx.activity.ComponentActivity;
import org.godotengine.godot.Godot;

public final class StartupActivity extends ComponentActivity {
    public AiriAndroidPlugin plugin;
    public KirieAndroidPlugin kirie;
    public View host;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Godot godot = Godot.Companion.getInstance(this);
        kirie = new KirieAndroidPlugin(godot);
        host = kirie.onMainCreate(this);
        setContentView(host);
        plugin = new AiriAndroidPlugin(godot);
        plugin.onMainCreate(this);
        kirie.createWebView(0, "res://src-web/dist/index.html");
    }
    public WebView browser() {
        ViewGroup group = (ViewGroup) host;
        for (int i = 0; i < group.getChildCount(); i++) {
            if (group.getChildAt(i) instanceof WebView) return (WebView) group.getChildAt(i);
        }
        return null;
    }
    @Override public void onDestroy() {
        plugin.onMainDestroy();
        kirie.onMainDestroy();
        super.onDestroy();
    }
}
