extends Object
class_name GdKirie

const _PointerInputForwarder = preload("./pointer_input_forwarder.gd")

signal webview_ready
signal text_received(message: String)
signal binary_received(bytes: PackedByteArray)
signal data_received(value)
signal permission_requested(permission_type: String, origin: String, request_id: int)
signal ipc_error(error: String)
var _pointer_input_forwarding_enabled = false

var pointer_input_forwarding_enabled: bool:
	get:
		return self._pointer_input_forwarding_enabled
	set(value):
		self._pointer_input_forwarding_enabled = value
		if not value:
			var cef_control = self._plugin_singleton if self._plugin_singleton is Control else null
			self._pointer_input_forwarder.reset(cef_control)

var _plugin_singleton = null
var _godot_cef_config = null
var _view_id = self.get_instance_id()
var _pointer_input_forwarder = _PointerInputForwarder.new()

func _init() -> void:
	if Engine.has_singleton(GdKirie.PLUGIN_SINGLETON_NAME):
		self._plugin_singleton = Engine.get_singleton(GdKirie.PLUGIN_SINGLETON_NAME)
		print("[Kirie][gd] platform singleton detected")
		self._connect_plugin_signals()
		return
	if self._is_desktop_os():
		self._initialize_desktop_cef_backend()
		return
	print("[Kirie][gd] platform singleton unavailable")

func create_webview(options = {}) -> void:
	var plugin = self._ensure_plugin_singleton("create_webview")
	if plugin == null:
		return
	var initial_url = ""
	if options.has("initial_url"):
		initial_url = "" + str(options.get("initial_url"))
	var parent_node = options.get("parent_node", null)
	if parent_node != null and not (parent_node is Node):
		var error = "Kirie create_webview parent_node option must be a Node"
		push_error(error)
		self.ipc_error.emit(error)
		return
	print("[Kirie][gd] create_webview initial_url=" + str(initial_url))
	if self._is_godot_cef_backend():
		self._create_cef_webview(initial_url, parent_node)
		return
	plugin.call("createWebView", self._view_id, initial_url)

func destroy_webview() -> void:
	var cef_control = self._plugin_singleton if self._plugin_singleton is Control else null
	self._pointer_input_forwarder.reset(cef_control)
	if self._plugin_singleton == null:
		return
	print("[Kirie][gd] destroy_webview")
	if self._is_godot_cef_backend():
		self._destroy_cef_webview()
		return
	self._plugin_singleton.call("destroyWebView", self._view_id)

func load_url(url: String) -> void:
	var plugin = self._ensure_plugin_singleton("load_url")
	if plugin == null:
		return
	print("[Kirie][gd] load_url url=" + str(url))
	if self._is_godot_cef_backend():
		plugin.set("url", url)
		return
	plugin.call("loadUrl", self._view_id, url)

func load_html_string(html: String, base_url: String = "") -> void:
	var plugin = self._ensure_plugin_singleton("load_html_string")
	if plugin == null:
		return
	print("[Kirie][gd] load_html_string bytes=" + str(html.length()) + " base_url=" + str(base_url))
	if self._is_godot_cef_backend():
		push_error("Kirie Godot CEF backend does not support load_html_string() yet")
		return
	plugin.call("loadHtmlString", self._view_id, html, base_url)

func send_text(message: String) -> void:
	var plugin = self._ensure_plugin_singleton("send_text")
	if plugin == null:
		return
	if self._is_godot_cef_backend():
		plugin.call("send_ipc_message", message)
		return
	plugin.call("sendText", self._view_id, message)

func send_binary(bytes: PackedByteArray) -> void:
	var plugin = self._ensure_plugin_singleton("send_binary")
	if plugin == null:
		return
	print("[Kirie][gd] send_binary bytes=" + str(bytes.size()))
	if self._is_godot_cef_backend():
		plugin.call("send_ipc_binary_message", bytes)
		return
	plugin.call("sendBinary", self._view_id, bytes)

func send_data(value) -> void:
	var plugin = self._ensure_plugin_singleton("send_data")
	if plugin == null:
		return
	print("[Kirie][gd] send_data " + str(value))
	# Android plugin methods are registered by concrete JVM parameter type.
	# Godot does not expose a Kotlin-side Variant parameter type, and JVM Object
	# parameters do not reliably carry Variant containers. Use Godot's supported
	# Dictionary conversion path as a private carrier, then unwrap on Android
	# before CBOR encoding.
	var value_type = typeof(value)
	var supported_types: Array = [Variant.Type.TYPE_NIL, Variant.Type.TYPE_BOOL, Variant.Type.TYPE_INT, Variant.Type.TYPE_FLOAT, Variant.Type.TYPE_STRING, Variant.Type.TYPE_ARRAY, Variant.Type.TYPE_DICTIONARY]
	if not supported_types.has(value_type):
		push_error("Unsupported Kirie data type: " + str(type_string(value_type)))
		return
	if self._is_godot_cef_backend():
		plugin.call("send_ipc_data", value)
		return
	plugin.call("sendData", self._view_id, {
		"value": value,
	})

func get_launch_option(key: String) -> String:
	var plugin = self._ensure_plugin_singleton("get_launch_option")
	if plugin == null:
		return ""
	var value = ""
	if self._is_godot_cef_backend():
		value = self._get_desktop_launch_option(key)
	else:
		value = "" + str(plugin.call("getLaunchOption", key))
	print("[Kirie][gd] get_launch_option key=" + str(key) + " value=" + str(value))
	return value

func grant_permission(request_id: int) -> bool:
	return self._resolve_permission(request_id, true)

func deny_permission(request_id: int) -> bool:
	return self._resolve_permission(request_id, false)

func is_available() -> bool:
	return self._plugin_singleton != null

func _get_desktop_launch_option(key: String) -> String:
	var option_names = PackedStringArray([key])
	var dash_key = key.replace("_", "-")
	if dash_key != key:
		option_names.append(dash_key)
	var launch_args = OS.get_cmdline_user_args()
	var index = 0
	while index < launch_args.size():
		var argument = launch_args.get(index)
		for option_name in option_names:
			var option = "--" + str(option_name)
			var option_prefix = "" + str(option) + "="
			if argument.begins_with(option_prefix):
				return argument.trim_prefix(option_prefix)
			if argument == option and index + 1 < launch_args.size():
				return launch_args.get(index + 1)
		index += 1
	return ""

func _connect_plugin_signals() -> void:
	if self._plugin_singleton == null:
		return
	if self._plugin_singleton.has_signal(StringName("webview_ready")):
		print("[Kirie][gd] connecting webview_ready signal")
		self._plugin_singleton.connect(StringName("webview_ready"), self._on_plugin_webview_ready)
	if self._plugin_singleton.has_signal(StringName("text_received")):
		print("[Kirie][gd] connecting text_received signal")
		self._plugin_singleton.connect(StringName("text_received"), self._on_plugin_text_received)
	if self._plugin_singleton.has_signal(StringName("binary_received")):
		print("[Kirie][gd] connecting binary_received signal")
		self._plugin_singleton.connect(StringName("binary_received"), self._on_plugin_binary_received)
	if self._plugin_singleton.has_signal(StringName("data_received")):
		print("[Kirie][gd] connecting data_received signal")
		self._plugin_singleton.connect(StringName("data_received"), self._on_plugin_data_received)
	if self._plugin_singleton.has_signal(StringName("permission_requested")):
		print("[Kirie][gd] connecting permission_requested signal")
		self._plugin_singleton.connect(StringName("permission_requested"), self._on_plugin_permission_requested)
	if self._plugin_singleton.has_signal(StringName("ipc_error")):
		print("[Kirie][gd] connecting ipc_error signal")
		self._plugin_singleton.connect(StringName("ipc_error"), self._on_plugin_ipc_error)

func _ensure_plugin_singleton(method_name: String):
	if self._plugin_singleton != null:
		return self._plugin_singleton
	if self._is_desktop_os():
		self._initialize_desktop_cef_backend()
		if self._plugin_singleton != null:
			return self._plugin_singleton
	var error = "Kirie platform singleton is not available for " + str(method_name) + "()"
	push_warning(error)
	self.ipc_error.emit(error)
	return null

func _resolve_permission(request_id: int, grant: bool) -> bool:
	var method_name = "grant_permission" if grant else "deny_permission"
	var plugin = self._ensure_plugin_singleton(method_name)
	if plugin == null:
		return false
	if self._is_godot_cef_backend():
		var result = plugin.call(method_name, request_id)
		return result is bool and result
	var native_method_name = "grantPermission" if grant else "denyPermission"
	if plugin.has_method(native_method_name):
		var result = plugin.call(native_method_name, self._view_id, request_id)
		return result is bool and result
	var error = "Kirie permission mediation is not available on this platform"
	push_warning(error)
	self.ipc_error.emit(error)
	return false

func _should_ignore_view_signal(view_id: int) -> bool:
	return view_id != -1 and view_id != self._view_id

func _is_godot_cef_backend() -> bool:
	if self._godot_cef_config == null:
		return false
	var cef_class_name = self._godot_cef_config.get("class_name")
	return (self._plugin_singleton != null and cef_class_name != "" and self._plugin_singleton.is_class(cef_class_name))

func _initialize_desktop_cef_backend() -> void:
	var config = KirieGodotCefConfig.load()
	if config == null:
		return
	self._godot_cef_config = config
	var cef_class_name = config.get("class_name")
	if not ClassDB.class_exists(cef_class_name):
		var message = "Kirie desktop backend requires Godot CEF " + str(config.get("version")) + " to be installed and registered in [native_extensions]. Install it with: " + str(config.get("setup_command"))
		push_error(message)
		var tree = Engine.get_main_loop()
		if tree is SceneTree:
			tree.quit(1)
		return
	var cef_backend = ClassDB.instantiate(cef_class_name)
	if not (cef_backend is Node):
		var error = "Failed to instantiate Godot CEF " + str(cef_class_name)
		self.ipc_error.emit(error)
		return
	self._plugin_singleton = cef_backend
	cef_backend.name = "KirieCefWebView"
	# TODO(godot-cef#227): Re-evaluate accelerated OSR pointer-motion jitter after
	# godot-cef implements a synchronized CEF-to-Godot GPU texture handoff.
	# https://github.com/dsh0416/godot-cef/issues/227
	var preload_script = GdKirie.GODOT_CEF_PRELOAD_SCRIPT.replace("%s", JSON.stringify(self._desktop_platform_os()))
	self._set_cef_property_if_present("preload_script", preload_script)
	self._set_cef_property_if_present("background_color", Color.TRANSPARENT)
	self._set_cef_property_if_present("url", "about:blank")
	self._connect_cef_signals()

func _is_desktop_os() -> bool:
	match OS.get_name():
		"macOS", "Windows", "Linux", "FreeBSD", "NetBSD", "OpenBSD", "BSD":
			return true
		_:
			return false

func _create_cef_webview(initial_url: String, parent_node: Node = null) -> void:
	var browser = self._plugin_singleton
	if not (browser is Node):
		var error = "Cannot create Godot CEF WebView because the desktop backend does not exist"
		self.ipc_error.emit(error)
		return
	if browser.get_parent() != null:
		if parent_node != null and browser.get_parent() != parent_node:
			browser.reparent(parent_node)
		if initial_url != "":
			browser.set("url", initial_url)
		self.call_deferred("_emit_cef_webview_ready")
		return
	if not (Engine.get_main_loop() is SceneTree):
		var error = "Cannot create Godot CEF WebView because no scene tree is available"
		self.ipc_error.emit(error)
		return
	self.call_deferred("_add_cef_webview_to_scene", initial_url, parent_node)

func _add_cef_webview_to_scene(initial_url: String, parent_node: Node = null) -> void:
	var browser = self._plugin_singleton
	if not (browser is Node):
		return
	if browser.get_parent() == null:
		var owner = self._resolve_cef_parent_node(parent_node)
		if owner == null:
			var error = "Cannot create Godot CEF WebView because no parent node is available"
			self.ipc_error.emit(error)
			return
		owner.add_child(browser)
	self._configure_cef_layout()
	if initial_url != "":
		browser.set("url", initial_url)
	self._emit_cef_webview_ready()

func _resolve_cef_parent_node(parent_node: Node = null) -> Node:
	if parent_node != null:
		return parent_node
	var tree = Engine.get_main_loop()
	if not (tree is SceneTree):
		return null
	return tree.root

func _destroy_cef_webview() -> void:
	var browser = self._plugin_singleton
	if not (browser is Node):
		return
	browser.queue_free()
	self._plugin_singleton = null

func _connect_cef_signals() -> void:
	var plugin = self._plugin_singleton
	if plugin == null:
		return
	if plugin.has_signal(StringName("ipc_message")):
		plugin.connect(StringName("ipc_message"), func(message: String) -> void:
			self._on_plugin_text_received(-1, message)
			)
	if plugin.has_signal(StringName("ipc_binary_message")):
		plugin.connect(StringName("ipc_binary_message"), func(bytes: PackedByteArray) -> void:
			self._on_plugin_binary_received(-1, bytes)
			)
	if plugin.has_signal(StringName("ipc_data_message")):
		plugin.connect(StringName("ipc_data_message"), func(value) -> void:
			self._on_plugin_data_received(-1, value)
			)
	if plugin.has_signal(StringName("permission_requested")):
		plugin.connect(StringName("permission_requested"), func(permission_type: String, origin: String, request_id: int) -> void:
			self._on_plugin_permission_requested(-1, permission_type, origin, request_id)
			)
	if plugin.has_signal(StringName("load_error")):
		plugin.connect(StringName("load_error"), self._on_cef_load_error)
	if plugin.has_signal(StringName("render_process_terminated")):
		plugin.connect(StringName("render_process_terminated"), self._on_cef_render_process_terminated)

func _configure_cef_layout() -> void:
	var plugin = self._plugin_singleton
	if plugin is Control:
		plugin.set_anchors_preset(Control.PRESET_FULL_RECT)
		plugin.offset_left = 0
		plugin.offset_top = 0
		plugin.offset_right = 0
		plugin.offset_bottom = 0
		return
	if plugin != null and self._cef_backend_has_property("texture_size"):
		plugin.set("texture_size", DisplayServer.window_get_size())

func _set_cef_property_if_present(property_name: String, value) -> void:
	var plugin = self._plugin_singleton
	if plugin == null or not self._cef_backend_has_property(property_name):
		return
	plugin.set(property_name, value)

func _cef_backend_has_property(property_name: String) -> bool:
	var plugin = self._plugin_singleton
	if plugin == null:
		return false
	for property in plugin.get_property_list():
		if "" + str(property.get("name", "")) == property_name:
			return true
	return false

func _desktop_platform_os() -> String:
	match OS.get_name():
		"macOS":
			return "macos"
		"Windows":
			return "windows"
		_:
			return "linux"

func _emit_cef_webview_ready() -> void:
	if self._plugin_singleton == null:
		return
	print("[Kirie][gd] signal webview_ready")
	self.webview_ready.emit()

func _on_cef_load_error(url: String, error_code: int, error_text: String) -> void:
	self._on_plugin_ipc_error(-1, "Godot CEF failed to load " + str(url) + ": " + str(error_text) + " (" + str(error_code) + ")")

func _on_cef_render_process_terminated(status: int, error_message: String) -> void:
	self._on_plugin_ipc_error(-1, "Godot CEF render process terminated: " + str(error_message) + " (" + str(status) + ")")

func _on_plugin_webview_ready(view_id: int) -> void:
	if self._should_ignore_view_signal(view_id):
		return
	print("[Kirie][gd] signal webview_ready")
	self.webview_ready.emit()

func _on_plugin_text_received(view_id: int, message: String) -> void:
	if self._should_ignore_view_signal(view_id):
		return
	# print("[Kirie][gd] signal text_received %s" % message)
	self.text_received.emit(message)

func _on_plugin_binary_received(view_id: int, bytes: PackedByteArray) -> void:
	if self._should_ignore_view_signal(view_id):
		return
	print("[Kirie][gd] signal binary_received bytes=" + str(bytes.size()))
	self.binary_received.emit(bytes)

func _on_plugin_data_received(view_id: int, value) -> void:
	if self._should_ignore_view_signal(view_id):
		return
	var cef_control = self._plugin_singleton if self._plugin_singleton is Control else null
	if self._pointer_input_forwarder.try_forward_pointer_input(value, self.pointer_input_forwarding_enabled, cef_control):
		return
	print("[Kirie][gd] signal data_received " + str(value))
	self.data_received.emit(value)

func _on_plugin_permission_requested(view_id: int, permission_type: String, origin: String, request_id: int) -> void:
	if self._should_ignore_view_signal(view_id):
		return
	print("[Kirie][gd] signal permission_requested type=" + str(permission_type) + " origin=" + str(origin) + " request_id=" + str(request_id))
	self.permission_requested.emit(permission_type, origin, request_id)

func _on_plugin_ipc_error(view_id: int, error: String) -> void:
	if self._should_ignore_view_signal(view_id):
		return
	print("[Kirie][gd] signal ipc_error " + str(error))
	self.ipc_error.emit(error)

const PLUGIN_SINGLETON_NAME = "Kirie"

const GODOT_CEF_PRELOAD_SCRIPT = "\nglobalThis.kirie ??= {};\nglobalThis.kirie.platform = Object.freeze({\n  os: %s,\n  backend: \"godot-cef\",\n});\n"
