@tool
extends EditorPlugin

const _ExportPlugin = preload("./export_plugin.gd")

var _export_plugin: EditorExportPlugin = null

func _enter_tree() -> void:
	var export_plugin = _ExportPlugin.new()
	self._export_plugin = export_plugin
	self.add_export_plugin(export_plugin)

func _exit_tree() -> void:
	if self._export_plugin == null:
		return
	self.remove_export_plugin(self._export_plugin)
	self._export_plugin = null
