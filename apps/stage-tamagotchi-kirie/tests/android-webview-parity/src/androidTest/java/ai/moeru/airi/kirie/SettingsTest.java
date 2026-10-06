package ai.moeru.airi.kirie;

import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.SettingsReference;
import java.lang.reflect.Method;
import org.junit.Test;
import static org.junit.Assert.*;

public final class SettingsTest {
    @Test public void navigationAndInputDefaultsMatchLoadedCapacitorConfiguration() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                WebView reference = new WebView(f.activity);
                SettingsReference.initialize(f.activity, reference);
                try {
                    for (String name : new String[] {
                        "getJavaScriptEnabled", "getDomStorageEnabled", "getMediaPlaybackRequiresUserGesture",
                        "getJavaScriptCanOpenWindowsAutomatically", "getAllowFileAccess", "getAllowContentAccess",
                        "getAllowFileAccessFromFileURLs", "getAllowUniversalAccessFromFileURLs", "getMixedContentMode",
                        "getLoadsImagesAutomatically", "getBlockNetworkImage", "getBlockNetworkLoads", "getCacheMode",
                        "getDatabaseEnabled", "getUseWideViewPort", "getLoadWithOverviewMode", "getTextZoom",
                        "supportMultipleWindows", "supportZoom", "getBuiltInZoomControls", "getDisplayZoomControls", "getLayoutAlgorithm",
                        "getUserAgentString", "getDefaultFontSize", "getDefaultFixedFontSize", "getMinimumFontSize"
                    }) {
                        try {
                            Method getter = WebSettings.class.getMethod(name);
                            assertEquals(name, getter.invoke(reference.getSettings()), getter.invoke(f.activity.webView.getSettings()));
                        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
                    }
                } finally { reference.destroy(); }
            });
        }
    }
}
