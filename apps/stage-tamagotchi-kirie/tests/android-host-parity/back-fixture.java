final class BackFixture {
    private static final class View {
        static final int VISIBLE = 0;
        static final int INVISIBLE = 4;
        private final int visibility;
        View(int visibility) { this.visibility = visibility; }
        int getVisibility() { return visibility; }
    }
    private final class Dispatcher {
        int nativeBackRequests;
        boolean fail;
        void onBackPressed() {
            if (enabled) throw new AssertionError("The AIRI callback must yield before dispatch");
            nativeBackRequests++;
            if (fail) throw new IllegalStateException("Native callback failed");
        }
    }
    private final class ComponentActivity {
        final Dispatcher dispatcher = new Dispatcher();
        Dispatcher getOnBackPressedDispatcher() { return dispatcher; }
    }
    private final ComponentActivity activity = new ComponentActivity();
    private View browserWebView;
    private boolean enabled = true;
    private int browserBackRequests;
    private void setEnabled(boolean value) { enabled = value; }
    private void navigateBrowserBack() { browserBackRequests++; }

    /* PRODUCTION_METHODS */

    public static void main(String[] args) {
        BackFixture fixture = new BackFixture();
        fixture.browserWebView = new View(View.VISIBLE);
        fixture.handleOnBackPressed();
        require(fixture.browserBackRequests == 1, "Visible WebView must own Back");
        require(fixture.activity.dispatcher.nativeBackRequests == 0, "Visible WebView must retain native Back");
        fixture.browserWebView = new View(View.INVISIBLE);
        fixture.handleOnBackPressed();
        require(fixture.activity.dispatcher.nativeBackRequests == 1, "Hidden WebView must yield Back to the native preview");
        require(fixture.browserBackRequests == 1, "Native preview must not navigate the renderer");
        require(fixture.enabled, "The AIRI callback must be enabled after native dispatch");
        fixture.activity.dispatcher.fail = true;
        try {
            fixture.handleOnBackPressed();
            throw new AssertionError("Native errors must propagate");
        } catch (IllegalStateException expected) {
            require(fixture.enabled, "The AIRI callback must recover after native failure");
        }
        fixture.browserWebView = new View(View.VISIBLE);
        fixture.handleOnBackPressed();
        require(fixture.browserBackRequests == 2, "Renderer Back must resume after the preview");
        System.out.println("back: PASS preview ownership and callback recovery");
    }
    private static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
}
