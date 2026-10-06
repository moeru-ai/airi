package ai.moeru.airi.kirie;

import org.junit.Test;
import static org.junit.Assert.*;

public final class FocusTest {
    @Test public void initialWebViewReceivesTouchFocusBeforeNavigation() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                assertTrue(f.activity.webView.hasFocus());
                assertTrue(f.activity.webView.isFocused());
            });
        }
    }
}
