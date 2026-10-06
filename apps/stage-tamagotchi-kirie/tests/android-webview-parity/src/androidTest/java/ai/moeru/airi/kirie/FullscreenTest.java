package ai.moeru.airi.kirie;

import android.view.View;
import org.junit.Test;
import static org.junit.Assert.*;

public final class FullscreenTest {
    @Test public void customViewIsImmediatelyHiddenAndNeverAttached() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                int[] actual = { 0 };
                int[] reference = { 0 };
                View custom = new View(f.activity);
                f.actual.onShowCustomView(custom, () -> actual[0]++);
                f.reference.onShowCustomView(custom, () -> reference[0]++);
                assertEquals(reference[0], actual[0]);
                assertEquals(1, actual[0]);
                assertNull(custom.getParent());
                f.actual.onHideCustomView();
                f.reference.onHideCustomView();
                assertEquals(reference[0], actual[0]);
            });
        }
    }
    @Test public void deprecatedOrientationCallbackRetainsPlatformDefault() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                int[] actual = { 0 };
                int[] reference = { 0 };
                f.actual.onShowCustomView(new View(f.activity), 0, () -> actual[0]++);
                f.reference.onShowCustomView(new View(f.activity), 0, () -> reference[0]++);
                assertEquals(reference[0], actual[0]);
            });
        }
    }
}
