"""Run the production resource rewrite with tracked inputs in a temporary Godot project."""
import argparse
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--godot', default='godot')
args = parser.parse_args()
app = Path(__file__).resolve().parents[2]
fixture = Path(__file__).parent / 'fixtures/godot-themes.xml'


class ThemeFixture(unittest.TestCase):
    def test_production_rewrite_preserves_all_items_and_other_resources(self):
        source = (app / 'addons/airi-android/export-plugin.gd').read_text()
        export_begin = source.split('func _export_begin(', 1)[1].split('\nfunc ', 1)[0]
        self.assertIn('\tconfigure_launch_resources()\n', export_begin)
        pocket = ElementTree.parse(app.parent / 'stage-pocket/android/app/src/main/res/values/styles.xml')
        parent = pocket.find("./style[@name='AppTheme.NoActionBar']").attrib['parent']
        self.assertEqual(parent, 'Theme.AppCompat.DayNight.NoActionBar')

        original = fixture.read_text()
        main_items = {
            item.attrib['name']: item.text
            for item in ElementTree.fromstring(original).find("./style[@name='GodotAppMainTheme']")
        }
        preset = (app / 'export_presets.cfg').read_text()
        custom_items = preset.split('gradle_build/custom_theme_attributes={\n', 1)[1].split('\n}', 1)[0]
        self.assertEqual(main_items, {
            'android:windowSwipeToDismiss': 'false',
            'android:windowIsTranslucent': 'false',
            'android:windowBackground': '#000000',
            **dict(re.findall(r'"([^"]+)": "([^"]+)"', custom_items)),
        })
        for additional_item in ('', '\t\t<item name="android:windowDisablePreview">true</item>\n'):
            with self.subTest(additional_item=additional_item), tempfile.TemporaryDirectory(prefix='airi-theme-fixture-') as directory:
                project = Path(directory) / 'kirie'
                build = project / 'android/build'
                themes = build / 'res/values/themes.xml'
                themes.parent.mkdir(parents=True)
                # This unrelated style catches an unscoped parent replacement.
                unrelated = '\t<style name="UnrelatedTheme" parent="@android:style/Theme.DeviceDefault.NoActionBar" />\n'
                before = original.replace('\t</style>', additional_item + '\t</style>', 1)
                before = before.replace('</resources>', unrelated + '</resources>')
                themes.write_text(before)
                manifest = build / 'src/main/AndroidManifest.xml'
                manifest.parent.mkdir(parents=True)
                manifest.write_text('<manifest />\n')
                (Path(directory) / 'stage-pocket/android/app/src/main/res').mkdir(parents=True)
                (project / 'project.godot').write_text('config_version=5\n')
                # Execute unchanged methods without the editor-only plugin lifecycle.
                constants = '\n'.join(
                    'const ' + name + ' = ' + source.split('const ' + name + ' = ', 1)[1].split('\nconst ', 1)[0]
                    for name in ('ANDROID_BUILD_ROOT', 'POCKET_RESOURCES', 'LAUNCH_MANIFEST', 'LAUNCH_RESOURCES')
                )
                methods = '\n\n'.join(
                    'func ' + name + '(' + source.split('func ' + name + '(', 1)[1].split('\n\nfunc ', 1)[0]
                    for name in ('configure_launch_resources', 'write_build_file')
                )
                (project / 'run.gd').write_text('''extends SceneTree

func _initialize() -> void:
	configure_launch_resources()
	configure_launch_resources()
	print("THEME_FIXTURE_COMPLETE")
	quit()
''' + '\n' + constants + '\n\n' + methods)
                result = subprocess.run(
                    [args.godot, '--headless', '--path', str(project), '--script', 'run.gd',
                     '--log-file', str(project / 'godot.log')],
                    capture_output=True, text=True, timeout=30, check=True,
                )
                self.assertIn('THEME_FIXTURE_COMPLETE', result.stdout)
                self.assertNotIn('SCRIPT ERROR:', result.stdout + result.stderr)

                after = themes.read_text()
                before_main = ElementTree.fromstring(before).find("./style[@name='GodotAppMainTheme']")
                after_main = ElementTree.fromstring(after).find("./style[@name='GodotAppMainTheme']")
                self.assertEqual(after_main.attrib['parent'], parent)
                self.assertEqual(
                    [(item.attrib, item.text) for item in after_main],
                    [(item.attrib, item.text) for item in before_main],
                )
                # Reversing only the target parent must restore every input byte.
                changed_tag = '<style name="GodotAppMainTheme" parent="' + parent + '">'
                original_tag = '<style name="GodotAppMainTheme" parent="' + before_main.attrib['parent'] + '">'
                self.assertEqual(after.replace(changed_tag, original_tag, 1), before)
                launch = ElementTree.parse(build / 'res/values/airi-launch.xml')
                main = launch.find("./style[@name='AiriAppMainTheme']")
                self.assertEqual(main.attrib, {'name': 'AiriAppMainTheme', 'parent': 'GodotAppMainTheme'})
                self.assertEqual([(item.attrib['name'], item.text) for item in main], [
                    ('android:background', '@null'),
                    ('android:windowBackground', '@color/airi_startup_window_background'),
                ])
                splash = launch.find("./style[@name='AiriAppSplashTheme']")
                self.assertEqual(splash.attrib, {'name': 'AiriAppSplashTheme', 'parent': 'Theme.SplashScreen'})
                self.assertEqual([(item.attrib['name'], item.text) for item in splash], [
                    ('android:background', '@drawable/splash'),
                ])


if __name__ == '__main__':
    unittest.main(argv=[__file__])
