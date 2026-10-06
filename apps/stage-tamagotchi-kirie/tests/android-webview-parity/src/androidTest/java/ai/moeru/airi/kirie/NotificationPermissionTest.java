package ai.moeru.airi.kirie;

import android.content.pm.PackageManager;
import org.junit.Test;
import static org.junit.Assert.*;

public final class NotificationPermissionTest {
    @Test public void androidEightThroughTwelveUseGlobalNotificationState() {
        assertTrue(check(32, PackageManager.PERMISSION_DENIED, true));
        assertFalse(check(32, PackageManager.PERMISSION_GRANTED, false));
    }

    @Test public void androidThirteenAndLaterRequireRuntimeAndGlobalGrants() {
        assertFalse(check(33, PackageManager.PERMISSION_DENIED, true));
        assertFalse(check(33, PackageManager.PERMISSION_GRANTED, false));
        assertTrue(check(33, PackageManager.PERMISSION_GRANTED, true));
    }

    private static boolean check(int sdkInt, int runtimePermission, boolean enabled) {
        return (Boolean) Fixture.callStatic(
            AiriAndroidPlugin.class,
            "notificationPermissionGranted",
            new Class<?>[] { int.class, int.class, boolean.class },
            sdkInt,
            runtimePermission,
            enabled
        );
    }
}
