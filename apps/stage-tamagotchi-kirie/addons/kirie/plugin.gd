@tool
extends EditorPlugin

const KirieExportPlugin = preload("res://addons/kirie/export_plugin.gd")

var _export_plugin: EditorExportPlugin


func _enter_tree() -> void:
	_export_plugin = KirieExportPlugin.new()
	add_export_plugin(_export_plugin)


func _exit_tree() -> void:
	if _export_plugin == null:
		return

	remove_export_plugin(_export_plugin)
	_export_plugin = null
