extends RefCounted
class_name KirieGodotCefConfig

static func load():
	var file = FileAccess.open(KirieGodotCefConfig.PATH, FileAccess.READ)
	if file == null:
		push_error("Kirie Godot CEF config not readable: " + str(KirieGodotCefConfig.PATH))
		return null
	var parsed = JSON.parse_string(file.get_as_text())
	if not (parsed is Dictionary):
		push_error("Kirie Godot CEF config must be a JSON object")
		return null
	var cef_class_name = parsed.get("class_name")
	var addon_path = parsed.get("addon_path")
	var version = parsed.get("version")
	var setup_command = parsed.get("setup_command")
	if not cef_class_name is String or not addon_path is String or not version is String or not setup_command is String:
		push_error("Kirie Godot CEF config has invalid fields")
		return null
	return {
		"class_name": cef_class_name,
		"addon_path": addon_path,
		"version": version,
		"setup_command": setup_command,
	}

const PATH = "res://addons/kirie/godot_cef.json"
