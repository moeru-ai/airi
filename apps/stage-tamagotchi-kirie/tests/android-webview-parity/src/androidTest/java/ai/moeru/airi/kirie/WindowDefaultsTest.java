package ai.moeru.airi.kirie;

import android.os.Message;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.SettingsReference;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import static org.junit.Assert.*;

public final class WindowDefaultsTest {
    @Test public void multipleWindowDefaultMatchesLoadedCapacitorSettings() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                WebView reference = new WebView(f.activity);
                try {
                    SettingsReference.initialize(f.activity, reference);
                    assertEquals(reference.getSettings().supportMultipleWindows(), f.activity.webView.getSettings().supportMultipleWindows());
                    assertFalse(f.activity.webView.getSettings().supportMultipleWindows());
                } finally { reference.destroy(); }
            });
        }
    }
    @Test public void scriptBlankTargetDoesNotCreateAnUnattachedNativePopup() throws Exception {
        try (Fixture f = new Fixture()) {
            AtomicInteger windows = new AtomicInteger();
            CountDownLatch evaluated = new CountDownLatch(1);
            Fixture.onMain(() -> {
                f.activity.webView.setWebChromeClient(new WebChromeClient() {
                    @Override public boolean onCreateWindow(WebView source, boolean dialog, boolean gesture, Message result) {
                        windows.incrementAndGet();
                        return f.actual.onCreateWindow(source, dialog, gesture, result);
                    }
                });
                f.activity.webView.evaluateJavascript("window.open('about:blank', '_blank'); 'requested'", value -> evaluated.countDown());
            });
            assertTrue(evaluated.await(10, TimeUnit.SECONDS));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            assertEquals(0, windows.get());
        }
    }
}
