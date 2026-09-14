class_name KirieGodotCefConfig
extends RefCounted

const PATH := "res://addons/kirie/godot_cef.json"


static func load() -> Dictionary:
	var file := FileAccess.open(PATH, FileAccess.READ)
	var config: Variant = JSON.parse_string(file.get_as_text())
	return config
