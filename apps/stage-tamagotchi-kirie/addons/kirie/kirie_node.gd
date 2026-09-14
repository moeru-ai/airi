class_name KirieNode
extends Control

signal webview_ready
signal text_received(message: String)
signal binary_received(bytes: PackedByteArray)
signal data_received(value: Variant)
signal ipc_error(error: String)

@export var initial_url := ""
@export var auto_create := true
@export var auto_destroy := true
@export var pointer_input_forwarding_enabled := false:
	set(value):
		pointer_input_forwarding_enabled = value
		if _kirie != null:
			_kirie.pointer_input_forwarding_enabled = value

var _kirie := GdKirie.new()


func _ready() -> void:
	_kirie.pointer_input_forwarding_enabled = pointer_input_forwarding_enabled
	_kirie.webview_ready.connect(func() -> void: webview_ready.emit())
	_kirie.text_received.connect(func(message: String) -> void: text_received.emit(message))
	_kirie.binary_received.connect(
		func(bytes: PackedByteArray) -> void: binary_received.emit(bytes)
	)
	_kirie.data_received.connect(func(value: Variant) -> void: data_received.emit(value))
	_kirie.ipc_error.connect(func(error: String) -> void: ipc_error.emit(error))

	if not auto_create:
		return

	create_webview()


func _exit_tree() -> void:
	if not is_instance_valid(_kirie):
		return

	if auto_destroy:
		_kirie.destroy_webview()

	_kirie.free()


func create_webview(options: Dictionary = {}) -> void:
	var create_options := options.duplicate()
	create_options["parent_node"] = self
	if not create_options.has("initial_url"):
		create_options["initial_url"] = initial_url

	_kirie.create_webview(create_options)


func destroy_webview() -> void:
	_kirie.destroy_webview()


func load_url(url: String) -> void:
	_kirie.load_url(url)


func load_html_string(html: String, base_url: String = "") -> void:
	_kirie.load_html_string(html, base_url)


func send_text(message: String) -> void:
	_kirie.send_text(message)


func send_binary(bytes: PackedByteArray) -> void:
	_kirie.send_binary(bytes)


func send_data(value: Variant) -> void:
	_kirie.send_data(value)


func get_launch_option(key: String) -> String:
	return _kirie.get_launch_option(key)


func is_available() -> bool:
	return _kirie.is_available()
