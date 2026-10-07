package ai.moeru.airi.kirie;

import android.app.Activity;
import android.content.Intent;
import android.webkit.WebChromeClient;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Map;

final class Fixture implements AutoCloseable {
    final ProbeActivity activity;
    final AiriAndroidPlugin plugin;
    final WebChromeClient actual;
    final BridgeWebChromeClient reference;
    final ProbeActivity.RecordingLauncher<String[], Map<String, Boolean>> permissions;

    Fixture() {
        activity = (ProbeActivity) InstrumentationRegistry.getInstrumentation().startActivitySync(
            new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(), ProbeActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        );
        plugin = new AiriAndroidPlugin(null);
        WebChromeClient[] clients = new WebChromeClient[2];
        onMain(() -> {
            call(plugin, "installBrowserChannel", new Class<?>[] { Activity.class, int.class }, activity, 1);
            clients[0] = activity.webView.getWebChromeClient();
            clients[1] = new BridgeWebChromeClient(new Bridge(activity));
        });
        actual = clients[0];
        reference = (BridgeWebChromeClient) clients[1];
        permissions = activity.recordLauncher(new ActivityResultContracts.RequestMultiplePermissions(), results -> {
            boolean granted = !results.containsValue(false);
            Object listener = get(plugin, "permissionListener");
            call(listener, "onPermissionSelect", new Class<?>[] { Boolean.class }, granted);
        });
        set(plugin, "permissionLauncher", permissions);
    }
    void deliverReferencePermissions(Map<String, Boolean> results) {
        @SuppressWarnings("unchecked")
        ProbeActivity.RecordingLauncher<String[], Map<String, Boolean>> launcher =
            (ProbeActivity.RecordingLauncher<String[], Map<String, Boolean>>) activity.launchers.get(0);
        launcher.deliver(results);
    }
    static void onMain(Runnable action) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(action);
    }
    static Object get(Object instance, String name) {
        try {
            Field field = instance.getClass().getDeclaredField(name);
            field.setAccessible(true);
            return field.get(instance);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    static void set(Object instance, String name, Object value) {
        try {
            Field field = instance.getClass().getDeclaredField(name);
            field.setAccessible(true);
            field.set(instance, value);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    static Object call(Object instance, String name, Class<?>[] types, Object... args) {
        try {
            Method method = instance.getClass().getDeclaredMethod(name, types);
            method.setAccessible(true);
            return method.invoke(instance, args);
        } catch (java.lang.reflect.InvocationTargetException error) {
            if (error.getCause() instanceof RuntimeException) throw (RuntimeException) error.getCause();
            throw new AssertionError(error.getCause());
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    static Object callStatic(Class<?> owner, String name, Class<?>[] types, Object... args) {
        try {
            Method method = owner.getDeclaredMethod(name, types);
            method.setAccessible(true);
            return method.invoke(null, args);
        } catch (java.lang.reflect.InvocationTargetException error) {
            if (error.getCause() instanceof RuntimeException) throw (RuntimeException) error.getCause();
            throw new AssertionError(error.getCause());
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    static void setStatic(Class<?> owner, String name, Object value) {
        try {
            Field field = owner.getDeclaredField(name);
            field.setAccessible(true);
            field.set(null, value);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    static Object getStatic(Class<?> owner, String name) {
        try {
            Field field = owner.getDeclaredField(name);
            field.setAccessible(true);
            return field.get(null);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    @Override public void close() {
        onMain(() -> {
            activity.webView.destroy();
            activity.finish();
        });
    }
}
