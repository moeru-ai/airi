@tool
extends EditorPlugin

const ExportPlugin = preload("./export-plugin.gd")

var export_plugin: EditorExportPlugin

func _enter_tree() -> void:
	export_plugin = ExportPlugin.new()
	add_export_plugin(export_plugin)

func _exit_tree() -> void:
	remove_export_plugin(export_plugin)
