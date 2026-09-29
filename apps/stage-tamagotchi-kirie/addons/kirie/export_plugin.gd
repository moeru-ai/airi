@tool
extends EditorExportPlugin

func _get_name() -> String:
	return self.PLUGIN_NAME

func _supports_platform(platform: EditorExportPlatform) -> bool:
	var os_name = platform.get_os_name().to_lower()
	return os_name == "android" or os_name == "ios" or self._export_platform_is_desktop(platform)

func _get_export_options(_platform: EditorExportPlatform) -> Array:
	return [{
		"option": {
		"name": self.OPTION_ENABLE_WEB_INSPECTOR,
		"type": Variant.Type.TYPE_BOOL,
	},
		"default_value": false,
	}, {
		"option": {
		"name": self.OPTION_ALLOW_TLS_BYPASS,
		"type": Variant.Type.TYPE_BOOL,
	},
		"default_value": false,
	}]

func _get_export_options_overrides(platform: EditorExportPlatform):
	if platform.get_os_name().to_lower() != "android":
		return {}
	var extra_args = self._android_extra_args_override()
	if extra_args.is_empty():
		return {}
	print("[Kirie][export] override Android command line extra args: " + str(extra_args))
	return {
		"command_line/extra_args": extra_args,
	}

func _export_begin(features: PackedStringArray, _is_debug: bool, _path: String, _flags: int) -> void:
	if self._features_are_desktop(features):
		self._assert_godot_cef_available()
		return
	if features.has("android"):
		self._add_android_web_asset_files(self.DEFAULT_WEB_ROOT)
		return
	if not features.has("ios"):
		return
	self._add_ios_native_plugin(_is_debug)
	self._add_ios_runtime_configuration()
	self._add_ios_web_bundle_files(self.DEFAULT_WEB_ROOT)

func _get_android_dependencies(_platform: EditorExportPlatform, _debug: bool) -> PackedStringArray:
	return PackedStringArray(["androidx.webkit:webkit:1.16.0", "com.fasterxml.jackson.dataformat:jackson-dataformat-cbor:2.21.3"])

func _get_android_dependencies_maven_repos(_platform: EditorExportPlatform, _debug: bool) -> PackedStringArray:
	return PackedStringArray()

func _get_android_libraries(_platform: EditorExportPlatform, _debug: bool) -> PackedStringArray:
	match self._get_android_aar_mode():
		"debug":
			return PackedStringArray([self.ANDROID_DEBUG_AAR])
		"release":
			return PackedStringArray([self.ANDROID_RELEASE_AAR])
	var message = "[Kirie][export] invalid Android AAR mode. Use " + str(self.ANDROID_DEBUG_AAR_ARG) + "=debug or " + str(self.ANDROID_DEBUG_AAR_ARG) + "=release"
	push_error(message)
	assert(false, message)
	return PackedStringArray()

func _get_android_manifest_application_element_contents(_platform: EditorExportPlatform, _debug: bool) -> String:
	return ("\n        <meta-data\n            android:name=\"%s\"\n            android:value=\"%s\" />\n        <meta-data\n            android:name=\"%s\"\n            android:value=\"%s\" />\n" % [self.ANDROID_META_ENABLE_WEB_INSPECTOR, self._xml_bool(self._option_enabled(self.OPTION_ENABLE_WEB_INSPECTOR)), self.ANDROID_META_ALLOW_TLS_BYPASS, self._xml_bool(self._option_enabled(self.OPTION_ALLOW_TLS_BYPASS))])

func _get_android_aar_mode() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg == "" + str(self.ANDROID_DEBUG_AAR_ARG) + "=debug":
			return "debug"
		if arg == "" + str(self.ANDROID_DEBUG_AAR_ARG) + "=release":
			return "release"
		if arg.begins_with("" + str(self.ANDROID_DEBUG_AAR_ARG) + "="):
			return "invalid"
	return "release"

func _android_extra_args_override() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("" + str(self.ANDROID_EXTRA_ARGS_ARG) + "="):
			return arg.substr(self.ANDROID_EXTRA_ARGS_ARG.length() + 1)
	return ""

func _add_ios_runtime_configuration() -> void:
	self.add_apple_embedded_platform_plist_content(("\n<key>%s</key>\n%s\n<key>%s</key>\n%s\n" % [self.IOS_PLIST_ENABLE_WEB_INSPECTOR_KEY, self._plist_bool(self._option_enabled(self.OPTION_ENABLE_WEB_INSPECTOR)), self.IOS_PLIST_ALLOW_TLS_BYPASS_KEY, self._plist_bool(self._option_enabled(self.OPTION_ALLOW_TLS_BYPASS))]))
	if not self._option_enabled(self.OPTION_ALLOW_TLS_BYPASS):
		return
	self.add_apple_embedded_platform_plist_content(self.IOS_INSECURE_NETWORK_PLIST_CONTENT)

func _option_enabled(option_name: String) -> bool:
	var value = self.get_option(option_name)
	return value is bool and value

func _xml_bool(value: bool) -> String:
	if value:
		return "true"
	return "false"

func _plist_bool(value: bool) -> String:
	if value:
		return "<true/>"
	return "<false/>"

func _add_android_web_asset_files(root_path: String) -> void:
	if not self._has_web_entry(root_path):
		return
	print("[Kirie][export] add Android web asset root: " + str(root_path))
	self._add_android_web_asset_directory(root_path)

func _add_android_web_asset_directory(dir_path: String) -> bool:
	# EditorExportPlugin only exposes add_file() for custom exported resources.
	# There is no Android directory-level API for resource files, so recurse here.
	for file_name in DirAccess.get_files_at(dir_path):
		var file_path = dir_path.path_join(file_name)
		var file = FileAccess.open(file_path, FileAccess.READ)
		if file == null:
			var message = "[Kirie][export] Android web asset file not readable: " + str(file_path)
			push_error(message)
			assert(false, message)
			return false
		self.add_file(file_path, file.get_buffer(file.get_length()), false)
	for directory_name in DirAccess.get_directories_at(dir_path):
		var child_path = dir_path.path_join(directory_name)
		if not self._add_android_web_asset_directory(child_path):
			return false
	return true

func _has_web_entry(root_path: String) -> bool:
	var index_path = root_path.path_join("index.html")
	if FileAccess.file_exists(index_path):
		return true
	var message = "[Kirie][export] web entry not found: " + str(index_path)
	push_error(message)
	assert(false, message)
	return false

func _add_ios_web_bundle_files(root_path: String) -> void:
	if not self._has_web_entry(root_path):
		return
	print("[Kirie][export] add iOS bundle web root: " + str(root_path))
	self.add_apple_embedded_platform_bundle_file(root_path)

func _add_ios_native_plugin(is_debug: bool) -> void:
	var framework_path = self.IOS_RELEASE_XCFRAMEWORK_PATH
	if is_debug:
		framework_path = self.IOS_DEBUG_XCFRAMEWORK_PATH
	if not DirAccess.dir_exists_absolute(framework_path):
		var message = "[Kirie][export] iOS framework not found: " + str(framework_path)
		push_error(message)
		assert(false, message)
		return
	print("[Kirie][export] add iOS framework: " + str(framework_path))
	self.add_apple_embedded_platform_framework(framework_path)
	for system_framework in self.IOS_SYSTEM_FRAMEWORKS:
		self.add_apple_embedded_platform_framework(system_framework)
	self.add_apple_embedded_platform_cpp_code(self.IOS_PLUGIN_CPP_CODE)

func _export_platform_is_desktop(platform: EditorExportPlatform) -> bool:
	var platform_name = platform.get_os_name().to_lower()
	match platform_name:
		"macos", "windows", "linux", "linuxbsd", "freebsd", "netbsd", "openbsd":
			return true
		_:
			return false

func _features_are_desktop(features: PackedStringArray) -> bool:
	return (features.has("macos") or features.has("windows") or features.has("linux") or features.has("linuxbsd") or features.has("bsd"))

func _assert_godot_cef_available() -> void:
	var config = KirieGodotCefConfig.load()
	if config == null:
		assert(false, "Kirie Godot CEF config is unavailable")
		return
	if DirAccess.dir_exists_absolute(config.get("addon_path")):
		return
	var message = "[Kirie][export] desktop export requires Godot CEF " + str(config.get("version")) + " at " + str(config.get("addon_path")) + ". Install it with: " + str(config.get("setup_command"))
	assert(false, message)

const PLUGIN_NAME = "Kirie"

const DEFAULT_WEB_ROOT = "res://src-web/dist"

const OPTION_ENABLE_WEB_INSPECTOR = "kirie/debug/enable_web_inspector"

const OPTION_ALLOW_TLS_BYPASS = "kirie/debug/allow_tls_bypass"

const ANDROID_DEBUG_AAR_ARG = "--kirie-android-aar"

const ANDROID_EXTRA_ARGS_ARG = "--kirie-android-extra-args"

const ANDROID_DEBUG_AAR = "kirie/libraries/android/Kirie-debug.aar"

const ANDROID_RELEASE_AAR = "kirie/libraries/android/Kirie-release.aar"

const ANDROID_META_ENABLE_WEB_INSPECTOR = "ai.moeru.kirie.ENABLE_WEB_INSPECTOR"

const ANDROID_META_ALLOW_TLS_BYPASS = "ai.moeru.kirie.ALLOW_TLS_BYPASS"

const IOS_PLIST_ENABLE_WEB_INSPECTOR_KEY = "KirieEnableWebInspector"

const IOS_PLIST_ALLOW_TLS_BYPASS_KEY = "KirieAllowTlsBypass"

const IOS_DEBUG_XCFRAMEWORK_PATH = "res://addons/kirie/ios/Kirie.debug.xcframework"

const IOS_RELEASE_XCFRAMEWORK_PATH = "res://addons/kirie/ios/Kirie.release.xcframework"

const IOS_SYSTEM_FRAMEWORKS = ["Foundation.framework", "UIKit.framework", "WebKit.framework"]

const IOS_INSECURE_NETWORK_PLIST_CONTENT = "\n<key>NSAppTransportSecurity</key>\n<dict>\n    <key>NSAllowsArbitraryLoads</key>\n    <true/>\n    <key>NSAllowsArbitraryLoadsInWebContent</key>\n    <true/>\n    <key>NSAllowsLocalNetworking</key>\n    <true/>\n</dict>\n"

const IOS_PLUGIN_CPP_CODE = "\nextern void init_kirie();\nextern void deinit_kirie();\n\nvoid kirie_generated_plugin_initialize();\nvoid kirie_generated_plugin_deinitialize();\n\nvoid godot_apple_embedded_plugins_initialize() {\n\tinit_kirie();\n\tkirie_generated_plugin_initialize();\n}\n\nvoid godot_apple_embedded_plugins_deinitialize() {\n\tkirie_generated_plugin_deinitialize();\n\tdeinit_kirie();\n}\n\n#define godot_apple_embedded_plugins_initialize kirie_generated_plugin_initialize\n#define godot_apple_embedded_plugins_deinitialize kirie_generated_plugin_deinitialize\n\n"
