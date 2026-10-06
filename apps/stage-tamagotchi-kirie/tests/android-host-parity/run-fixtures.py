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
parser.add_argument('case', choices=['authentication'])
parser.add_argument('--json-jar', type=Path, required=True)
args = parser.parse_args()
app = Path(__file__).resolve().parents[2]
source = (app / 'addons/airi-android/export-plugin.gd').read_text()
fixture = (Path(__file__).parent / 'authentication-fixture.java').read_text()
methods = '\n'.join(method(source, signature) for signature in [
    'private void openAuthorization(',
    'private void sendEventaResponse(',
    'private void sendEventaError(',
])
java_home = Path(os.environ['JAVA_HOME'])
with tempfile.TemporaryDirectory(prefix='airi-host-fixture-') as directory:
    out = Path(directory)
    java = out / 'AuthenticationFixture.java'
    java.write_text(fixture.replace('/* PRODUCTION_METHODS */', methods))
    subprocess.run([str(java_home / 'bin/javac'), '-cp', str(args.json_jar), '-d', str(out), str(java)], check=True)
    subprocess.run([str(java_home / 'bin/java'), '-cp', os.pathsep.join([str(out), str(args.json_jar)]), 'AuthenticationFixture'], check=True)
