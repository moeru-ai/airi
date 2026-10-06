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
