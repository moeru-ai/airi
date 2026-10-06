package ai.moeru.airi.kirie;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.WebChromeClient;
import androidx.activity.result.ActivityResult;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

public final class CaptureTest {
    @Test public void exactWildcardsAndVideoPrecedenceMatchReference() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                f.activity.permissions.put(Manifest.permission.CAMERA, PackageManager.PERMISSION_GRANTED);
                for (String[] accept : new String[][] {
                    { "image/*" }, { "video/*" }, { "image/*", "video/*" },
                    { "image/png" }, { ".jpg" }, { "IMAGE/*" }, { " image/*" }, { "audio/*" }, { "*/*" }
                }) {
                    Parameters parameters = new Parameters(true, accept);
                    f.actual.onShowFileChooser(f.activity.webView, value -> {}, parameters);
                    f.reference.onShowFileChooser(f.activity.webView, value -> {}, parameters);
                    Intent actual = last(f.activity.intents);
                    Intent expected = referenceIntent(f);
                    assertEquals(expected.getAction(), actual.getAction());
                    assertEquals(expected.getType(), actual.getType());
                    assertEquals(expected.getFlags(), actual.getFlags());
                }
            });
        }
    }
    @Test public void captureDisabledUsesPickerEvenWithMediaWildcards() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                Parameters parameters = new Parameters(false, "image/*", "video/*");
                f.actual.onShowFileChooser(f.activity.webView, value -> {}, parameters);
                f.reference.onShowFileChooser(f.activity.webView, value -> {}, parameters);
                assertEquals(Intent.ACTION_GET_CONTENT, last(f.activity.intents).getAction());
                assertEquals(referenceIntent(f).getAction(), last(f.activity.intents).getAction());
            });
        }
    }
    @Test public void deniedCameraPermissionCompletesWithNullWithoutLaunchingPicker() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                List<Uri[]> actual = new ArrayList<>();
                List<Uri[]> expected = new ArrayList<>();
                Parameters parameters = new Parameters(true, "video/*");
                f.actual.onShowFileChooser(f.activity.webView, actual::add, parameters);
                f.reference.onShowFileChooser(f.activity.webView, expected::add, parameters);
                assertArrayEquals(new String[] { Manifest.permission.CAMERA }, f.permissions.inputs.get(0));
                f.permissions.deliver(Map.of(Manifest.permission.CAMERA, false));
                f.deliverReferencePermissions(Map.of(Manifest.permission.CAMERA, false));
                assertEquals(expected.size(), actual.size());
                assertNull(actual.get(0));
                assertTrue(f.activity.intents.isEmpty());
            });
        }
    }
    @Test public void imageOutputUsesGrantedContentUriAndIgnoresResultIntent() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                f.activity.permissions.put(Manifest.permission.CAMERA, PackageManager.PERMISSION_GRANTED);
                List<Uri[]> actual = new ArrayList<>();
                List<Uri[]> expected = new ArrayList<>();
                Parameters parameters = new Parameters(true, "image/*");
                f.actual.onShowFileChooser(f.activity.webView, actual::add, parameters);
                f.reference.onShowFileChooser(f.activity.webView, expected::add, parameters);
                Intent intent = last(f.activity.intents);
                assertEquals(MediaStore.ACTION_IMAGE_CAPTURE, intent.getAction());
                Uri uri = intent.getParcelableExtra(MediaStore.EXTRA_OUTPUT);
                assertNotNull(uri);
                assertEquals("content", uri.getScheme());
                assertEquals(f.activity.getPackageName() + ".fileprovider", uri.getAuthority());
                assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION, intent.getFlags());
                deliver(f, Activity.RESULT_OK, null);
                assertEquals(1, expected.size());
                assertEquals(1, actual.size());
                assertEquals(uri, actual.get(0)[0]);
                deliver(f, Activity.RESULT_CANCELED, null);
                assertNull(actual.get(1));
                assertNull(expected.get(1));
            });
        }
    }
    @Test public void videoResultUsesDataUriAndPreservesNullIntentFailure() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                f.activity.permissions.put(Manifest.permission.CAMERA, PackageManager.PERMISSION_GRANTED);
                List<Uri[]> actual = new ArrayList<>();
                List<Uri[]> expected = new ArrayList<>();
                Parameters parameters = new Parameters(true, "video/*");
                f.actual.onShowFileChooser(f.activity.webView, actual::add, parameters);
                f.reference.onShowFileChooser(f.activity.webView, expected::add, parameters);
                assertEquals(MediaStore.ACTION_VIDEO_CAPTURE, last(f.activity.intents).getAction());
                Uri uri = Uri.parse("content://capture/video");
                deliver(f, Activity.RESULT_OK, new Intent().setData(uri));
                assertArrayEquals(expected.get(0), actual.get(0));
                assertArrayEquals(new Uri[] { uri }, actual.get(0));
                deliver(f, Activity.RESULT_OK, new Intent());
                assertArrayEquals(new Uri[] { null }, actual.get(1));
                assertArrayEquals(expected.get(1), actual.get(1));
                assertThrows(NullPointerException.class, () -> f.plugin.onMainActivityResult(4103, Activity.RESULT_OK, null));
                assertThrows(NullPointerException.class, () -> deliverReference(f, Activity.RESULT_OK, null));
                deliver(f, Activity.RESULT_CANCELED, null);
                assertNull(actual.get(2));
                assertNull(expected.get(2));
            });
        }
    }
    @Test public void laterCaptureReplacesPickerWithoutCompletingOldCallback() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                f.activity.permissions.put(Manifest.permission.CAMERA, PackageManager.PERMISSION_GRANTED);
                List<Uri[]> oldActual = new ArrayList<>();
                List<Uri[]> oldExpected = new ArrayList<>();
                List<Uri[]> actual = new ArrayList<>();
                List<Uri[]> expected = new ArrayList<>();
                f.actual.onShowFileChooser(f.activity.webView, oldActual::add, new Parameters(false, "*/*"));
                f.reference.onShowFileChooser(f.activity.webView, oldExpected::add, new Parameters(false, "*/*"));
                f.actual.onShowFileChooser(f.activity.webView, actual::add, new Parameters(true, "video/*"));
                f.reference.onShowFileChooser(f.activity.webView, expected::add, new Parameters(true, "video/*"));
                deliver(f, Activity.RESULT_CANCELED, null);
                assertTrue(oldActual.isEmpty());
                assertTrue(oldExpected.isEmpty());
                assertEquals(expected.size(), actual.size());
            });
        }
    }
    @Test public void multipleModeStillLaunchesOneCaptureWithoutMultipleExtra() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                f.activity.permissions.put(Manifest.permission.CAMERA, PackageManager.PERMISSION_GRANTED);
                Parameters parameters = new Parameters(true, "video/*");
                parameters.mode = WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;
                f.actual.onShowFileChooser(f.activity.webView, value -> {}, parameters);
                f.reference.onShowFileChooser(f.activity.webView, value -> {}, parameters);
                assertEquals(MediaStore.ACTION_VIDEO_CAPTURE, last(f.activity.intents).getAction());
                assertFalse(last(f.activity.intents).hasExtra(Intent.EXTRA_ALLOW_MULTIPLE));
                assertEquals(referenceIntent(f).hasExtra(Intent.EXTRA_ALLOW_MULTIPLE), last(f.activity.intents).hasExtra(Intent.EXTRA_ALLOW_MULTIPLE));
            });
        }
    }
    @Test public void temporaryImageFailureFallsBackToExistingPicker() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                f.activity.permissions.put(Manifest.permission.CAMERA, PackageManager.PERMISSION_GRANTED);
                f.activity.imageDirectory = new java.io.File("/proc/airi-capture-unwritable");
                Parameters parameters = new Parameters(true, "image/*");
                f.actual.onShowFileChooser(f.activity.webView, value -> {}, parameters);
                f.reference.onShowFileChooser(f.activity.webView, value -> {}, parameters);
                assertEquals(Intent.ACTION_GET_CONTENT, last(f.activity.intents).getAction());
                assertEquals(referenceIntent(f).getAction(), last(f.activity.intents).getAction());
            });
        }
    }
    @Test public void captureLaunchExceptionEscapesWithoutCompletingCallback() {
        try (Fixture f = new Fixture()) {
            Fixture.onMain(() -> {
                f.activity.permissions.put(Manifest.permission.CAMERA, PackageManager.PERMISSION_GRANTED);
                f.activity.launchError = new android.content.ActivityNotFoundException("capture removed after resolution");
                List<Uri[]> actual = new ArrayList<>();
                List<Uri[]> expected = new ArrayList<>();
                Parameters parameters = new Parameters(true, "video/*");
                assertThrows(android.content.ActivityNotFoundException.class, () -> f.actual.onShowFileChooser(f.activity.webView, actual::add, parameters));
                assertThrows(android.content.ActivityNotFoundException.class, () -> f.reference.onShowFileChooser(f.activity.webView, expected::add, parameters));
                assertTrue(actual.isEmpty());
                assertTrue(expected.isEmpty());
            });
        }
    }
    private static void deliver(Fixture f, int code, Intent data) {
        f.plugin.onMainActivityResult(4103, code, data);
        deliverReference(f, code, data);
    }
    private static void deliverReference(Fixture f, int code, Intent data) {
        @SuppressWarnings("unchecked")
        ProbeActivity.RecordingLauncher<Intent, ActivityResult> launcher =
            (ProbeActivity.RecordingLauncher<Intent, ActivityResult>) f.activity.launchers.get(1);
        launcher.deliver(new ActivityResult(code, data));
    }
    private static Intent referenceIntent(Fixture f) {
        @SuppressWarnings("unchecked")
        ProbeActivity.RecordingLauncher<Intent, ActivityResult> launcher =
            (ProbeActivity.RecordingLauncher<Intent, ActivityResult>) f.activity.launchers.get(1);
        return last(launcher.inputs);
    }
    private static <T> T last(List<T> values) { return values.get(values.size() - 1); }
    private static final class Parameters extends WebChromeClient.FileChooserParams {
        int mode = MODE_OPEN;
        private final boolean capture;
        private final String[] types;
        Parameters(boolean capture, String... types) { this.capture = capture; this.types = types; }
        @Override public int getMode() { return mode; }
        @Override public String[] getAcceptTypes() { return types; }
        @Override public boolean isCaptureEnabled() { return capture; }
        @Override public CharSequence getTitle() { return null; }
        @Override public String getFilenameHint() { return null; }
        @Override public Intent createIntent() { return new Intent(Intent.ACTION_GET_CONTENT).setType("*/*"); }
    }
}
