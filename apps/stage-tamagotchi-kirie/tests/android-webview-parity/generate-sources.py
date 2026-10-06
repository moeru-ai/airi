"""Compile the production plugin and the installed Capacitor client without rewriting their methods."""
import json
import sys
from pathlib import Path

app = Path(__file__).resolve().parents[2]
out = Path(sys.argv[1])
capacitor = app.parent / 'stage-pocket/node_modules/@capacitor/android'
assert json.loads((capacitor / 'package.json').read_text())['version'] == '8.5.0'
source = capacitor / 'capacitor/src/main/java/com/getcapacitor'

def write(relative, text):
    destination = out / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(text)

plugin = (app / 'addons/airi-android/export-plugin.gd').read_text()
java = plugin.split('const ANDROID_PLUGIN_SOURCE = """', 1)[1].split('\n"""', 1)[0]
write('ai/moeru/airi/kirie/AiriAndroidPlugin.java', java)
for name in ('BridgeWebChromeClient.java', 'util/PermissionHelper.java', 'util/InternalUtils.java'):
    write('com/getcapacitor/' + name, (source / name).read_text())

# Preserve the full loaded configuration instead of substituting the Builder defaults.
for name in ('CapConfig.java', 'PluginConfig.java', 'util/JSONUtils.java', 'util/WebColor.java'):
    write('com/getcapacitor/' + name, (source / name).read_text())

def method(text, signature):
    start = text.index(signature)
    brace = text.index('{', start)
    depth = 1
    end = brace + 1
    while depth:
        depth += (text[end] == '{') - (text[end] == '}')
        end += 1
    return text[start:end]

file_reader = method((source / 'FileUtils.java').read_text(), 'static String readFileFromAssets')
file_reader += '\n' + method((source / 'FileUtils.java').read_text(), 'static String readFileFromDisk')
write('com/getcapacitor/FileUtils.java', '''package com.getcapacitor;
import android.content.res.AssetManager;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;
import java.io.File;
import java.io.FileReader;
final class FileUtils { ''' + file_reader + ' }')
bridge = (source / 'Bridge.java').read_text()
settings = bridge.split('private void initWebView() {', 1)[1].split('        appUrlConfig =', 1)[0]
settings = settings.replace('this.config', 'config')
write('com/getcapacitor/SettingsReference.java', '''package com.getcapacitor;
import android.app.Activity;
import android.webkit.WebView;
import android.webkit.WebSettings;
import com.getcapacitor.util.WebColor;
public final class SettingsReference {
    public static void initialize(Activity activity, WebView webView) {
        CapConfig config = CapConfig.loadDefault(activity);
''' + settings + '\n    }\n}')

assets = out.parent / 'assets'
assets.mkdir(parents=True, exist_ok=True)
(assets / 'capacitor.config.json').write_bytes(
    (app.parent / 'stage-pocket/android/app/src/main/assets/capacitor.config.json').read_bytes()
)

startup = assets / 'src-web/dist/android/index.html'
startup.parent.mkdir(parents=True, exist_ok=True)
startup.write_bytes((app / 'tests/android-webview-parity/fixtures/startup.html').read_bytes())
