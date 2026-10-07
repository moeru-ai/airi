package ai.moeru.airi.kirie;

import android.content.Intent;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import static org.junit.Assert.*;

public final class StartupTest {
    @Test public void kirieLoadsThePackagedUniversalPage() throws Exception {
        StartupActivity activity = (StartupActivity) InstrumentationRegistry.getInstrumentation().startActivitySync(
            new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(), StartupActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        );
        try {
            WebView[] browser = new WebView[1];
            Fixture.onMain(() -> browser[0] = activity.browser());
            assertNotNull("The universal page must attach through Kirie", browser[0]);
            String ready = "null";
            for (int i = 0; i < 100 && !ready.equals("true"); i++) {
                ready = evaluate(browser[0], "document.readyState === 'complete' && !!document.querySelector('#route') && window.reply === true");
                if (!ready.equals("true")) Thread.sleep(100);
            }
            assertEquals("The packaged page and Android bridge reply must load", "true", ready);
            String before = evaluate(browser[0], "performance.timeOrigin");
            assertEquals("true", evaluate(browser[0], "document.querySelector('#route').click(); location.hash === '#settings'"));
            assertEquals("true", evaluate(browser[0], "document.querySelector('#name').value = 'alive'; document.querySelector('#name').focus(); document.activeElement.id === 'name'"));
            assertEquals("\"alive\"", evaluate(browser[0], "document.querySelector('#name').value"));
            assertEquals(before, evaluate(browser[0], "performance.timeOrigin"));
        } finally { Fixture.onMain(activity::finish); }
    }
    private static String evaluate(WebView browser, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        String[] value = new String[1];
        Fixture.onMain(() -> browser.evaluateJavascript(script, result -> { value[0] = result; latch.countDown(); }));
        assertTrue("JavaScript must remain responsive", latch.await(5, TimeUnit.SECONDS));
        return value[0];
    }
}
