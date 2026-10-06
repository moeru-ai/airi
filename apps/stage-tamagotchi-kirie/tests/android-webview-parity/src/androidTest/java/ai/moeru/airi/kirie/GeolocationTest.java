package ai.moeru.airi.kirie;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

public final class GeolocationTest {
    @Test public void bothGrantedReturnsImmediatelyWithoutRememberingOrigin() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                f.activity.permissions.put(Manifest.permission.ACCESS_COARSE_LOCATION, PackageManager.PERMISSION_GRANTED);
                f.activity.permissions.put(Manifest.permission.ACCESS_FINE_LOCATION, PackageManager.PERMISSION_GRANTED);
                List<String> actual = prompt(f.actual);
                List<String> reference = prompt(f.reference);
                assertEquals(reference, actual);
                assertEquals(List.of("https://origin.invalid:true:false"), actual);
                assertTrue(f.permissions.inputs.isEmpty());
            });
        }
    }
    @Test public void deniedRequestsBothAndReturnsFalseWithoutRememberingOrigin() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                List<String> actual = prompt(f.actual);
                List<String> reference = prompt(f.reference);
                assertTrue(actual.isEmpty());
                assertArrayEquals(new String[] { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }, f.permissions.inputs.get(0));
                Map<String, Boolean> result = Map.of(Manifest.permission.ACCESS_COARSE_LOCATION, false, Manifest.permission.ACCESS_FINE_LOCATION, false);
                f.permissions.deliver(result);
                f.deliverReferencePermissions(result);
                assertEquals(reference, actual);
                assertEquals(List.of("https://origin.invalid:false:false"), actual);
            });
        }
    }
    @Test public void coarseOnlyRequestsBothThenUsesAndroid12ApproximateLocationRule() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                f.activity.permissions.put(Manifest.permission.ACCESS_COARSE_LOCATION, PackageManager.PERMISSION_GRANTED);
                List<String> actual = prompt(f.actual);
                List<String> reference = prompt(f.reference);
                assertTrue(actual.isEmpty());
                Map<String, Boolean> result = Map.of(Manifest.permission.ACCESS_COARSE_LOCATION, true, Manifest.permission.ACCESS_FINE_LOCATION, false);
                f.permissions.deliver(result);
                f.deliverReferencePermissions(result);
                assertEquals(reference, actual);
                assertEquals(List.of("https://origin.invalid:" + (Build.VERSION.SDK_INT >= 31) + ":false"), actual);
            });
        }
    }
    @Test public void permissionListenerRetainsLastOriginAndEmptyResultGrants() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                List<String> first = prompt(f.actual);
                List<String> actual = prompt(f.actual);
                List<String> referenceFirst = prompt(f.reference);
                List<String> reference = prompt(f.reference);
                f.permissions.deliver(Map.of());
                f.deliverReferencePermissions(Map.of());
                f.permissions.deliver(Map.of());
                f.deliverReferencePermissions(Map.of());
                assertTrue(first.isEmpty());
                assertTrue(referenceFirst.isEmpty());
                assertEquals(reference, actual);
                assertEquals(2, actual.size());
            });
        }
    }
    private static List<String> prompt(android.webkit.WebChromeClient client) {
        List<String> calls = new ArrayList<>();
        client.onGeolocationPermissionsShowPrompt("https://origin.invalid", (origin, allow, retain) -> calls.add(origin + ":" + allow + ":" + retain));
        return calls;
    }
}
