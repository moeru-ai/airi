package ai.moeru.airi.kirie;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.activity.ComponentActivity;
import org.godotengine.godot.Godot;

public final class StartupActivity extends ComponentActivity {
    public AiriAndroidPlugin plugin;
    public View host;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        plugin = new AiriAndroidPlugin(Godot.Companion.getInstance(this));
        host = plugin.onMainCreate(this);
        setContentView(host);
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
        super.onDestroy();
    }
}
