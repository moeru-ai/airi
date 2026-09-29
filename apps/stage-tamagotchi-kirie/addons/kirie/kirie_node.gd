extends Control
class_name KirieNode

signal webview_ready
signal text_received(message: String)
signal binary_received(bytes: PackedByteArray)
signal data_received(value)
signal permission_requested(permission_type: String, origin: String, request_id: int)
signal ipc_error(error: String)
@export
var initial_url = ""
@export
var auto_create = true
@export
var auto_destroy = true

@export
var pointer_input_forwarding_enabled: bool = false:
	set(value):
		pointer_input_forwarding_enabled = value
		if self._kirie != null:
			self._kirie.pointer_input_forwarding_enabled = value

var _kirie = GdKirie.new()

func _ready() -> void:
	self._kirie.pointer_input_forwarding_enabled = self.pointer_input_forwarding_enabled
	self._kirie.webview_ready.connect(func() -> void:
		self.webview_ready.emit()
		)
	self._kirie.text_received.connect(func(message: String) -> void:
		self.text_received.emit(message)
		)
	self._kirie.binary_received.connect(func(bytes: PackedByteArray) -> void:
		self.binary_received.emit(bytes)
		)
	self._kirie.data_received.connect(func(value) -> void:
		self.data_received.emit(value)
		)
	self._kirie.permission_requested.connect(func(permission_type: String, origin: String, request_id: int) -> void:
		self.permission_requested.emit(permission_type, origin, request_id)
		)
	self._kirie.ipc_error.connect(func(error: String) -> void:
		self.ipc_error.emit(error)
		)
	if not self.auto_create:
		return
	self.create_webview()

func _exit_tree() -> void:
	if not is_instance_valid(self._kirie):
		return
	if self.auto_destroy:
		self._kirie.destroy_webview()
	self._kirie.free()

func create_webview(options = {}) -> void:
	var create_options = options.duplicate()
	create_options.set("parent_node", self)
	if not create_options.has("initial_url"):
		create_options.set("initial_url", self.initial_url)
	self._kirie.create_webview(create_options)

func destroy_webview() -> void:
	self._kirie.destroy_webview()

func load_url(url: String) -> void:
	self._kirie.load_url(url)

func load_html_string(html: String, base_url: String = "") -> void:
	self._kirie.load_html_string(html, base_url)

func send_text(message: String) -> void:
	self._kirie.send_text(message)

func send_binary(bytes: PackedByteArray) -> void:
	self._kirie.send_binary(bytes)

func send_data(value) -> void:
	self._kirie.send_data(value)

func get_launch_option(key: String) -> String:
	return self._kirie.get_launch_option(key)

func grant_permission(request_id: int) -> bool:
	return self._kirie.grant_permission(request_id)

func deny_permission(request_id: int) -> bool:
	return self._kirie.deny_permission(request_id)

func is_available() -> bool:
	return self._kirie.is_available()
