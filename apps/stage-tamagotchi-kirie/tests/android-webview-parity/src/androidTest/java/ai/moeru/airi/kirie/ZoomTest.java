package ai.moeru.airi.kirie;

import org.junit.Test;
import static org.junit.Assert.*;

public final class ZoomTest {
    @Test public void zoomSettingsKeepPlatformSupportButDisableControls() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                assertTrue(f.activity.webView.getSettings().supportZoom());
                assertFalse(f.activity.webView.getSettings().getDisplayZoomControls());
                assertFalse(f.activity.webView.getSettings().getBuiltInZoomControls());
            });
        }
    }
}
