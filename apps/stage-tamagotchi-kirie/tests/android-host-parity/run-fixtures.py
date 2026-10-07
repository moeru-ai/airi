"""Run unchanged production Java methods with JVM fixtures for Android external boundaries."""
import argparse
import os
import subprocess
import tempfile
from pathlib import Path


def method(source, signature):
    start = source.index(signature)
    brace = source.index('{', start)
    depth = 1
    end = brace + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('case', choices=['authentication', 'websocket'])
parser.add_argument('--json-jar', type=Path, required=True)
args = parser.parse_args()
app = Path(__file__).resolve().parents[2]
source = (app / 'addons/airi-android/export-plugin.gd').read_text()
if args.case == 'authentication':
    fixture_name = 'AuthenticationFixture'
    signatures = [
        'private void openAuthorization(',
        'private void rejectAuthorization(',
        'private void sendEventaResponse(',
        'private void sendEventaError(',
    ]
else:
    fixture_name = 'WebSocketFixture'
    signatures = [
        'public void onFailure(WebSocket socket, Throwable error, Response response)',
        'private JSONObject createEvent(',
        'private JSONObject addEventValue(',
    ]
fixture = (Path(__file__).parent / (args.case + '-fixture.java')).read_text()
methods = '\n'.join(method(source, signature) for signature in signatures)
java_home = Path(os.environ['JAVA_HOME'])
with tempfile.TemporaryDirectory(prefix='airi-host-fixture-') as directory:
    out = Path(directory)
    java = out / (fixture_name + '.java')
    java.write_text(fixture.replace('/* PRODUCTION_METHODS */', methods))
    subprocess.run([str(java_home / 'bin/javac'), '-cp', str(args.json_jar), '-d', str(out), str(java)], check=True)
    subprocess.run([str(java_home / 'bin/java'), '-cp', os.pathsep.join([str(out), str(args.json_jar)]), fixture_name], check=True)
