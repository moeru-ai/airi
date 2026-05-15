@tool
extends EditorPlugin
const inspector_plugin_class = preload("./inspector_mtoon.gd")

var inspector_plugin: Object = null


func _enter_tree() -> void:
	inspector_plugin = inspector_plugin_class.new()
	add_inspector_plugin(inspector_plugin)


func _exit_tree() -> void:
	remove_inspector_plugin(inspector_plugin)
	inspector_plugin = null
