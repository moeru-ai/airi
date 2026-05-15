@tool
extends EditorPlugin

var import_plugin: EditorSceneFormatImporter

const VRMC_node_constraint = preload("./1.0/VRMC_node_constraint.gd")
var VRMC_node_constraint_inst := VRMC_node_constraint.new()

const VRMC_springBone = preload("./1.0/VRMC_springBone.gd")
var VRMC_springBone_inst := VRMC_springBone.new()

const VRMC_materials_mtoon = preload("./1.0/VRMC_materials_mtoon.gd")
var VRMC_materials_mtoon_inst := VRMC_materials_mtoon.new()

const VRMC_materials_hdr_emissiveMultiplier = preload("./1.0/VRMC_materials_hdr_emissiveMultiplier.gd")
var VRMC_materials_hdr_emissiveMultiplier_inst := VRMC_materials_hdr_emissiveMultiplier.new()

const VRMC_vrm = preload("./1.0/VRMC_vrm.gd")
var VRMC_vrm_inst := VRMC_vrm.new()

const VRMC_vrm_animation = preload("./1.0/VRMC_vrm_animation.gd")
var VRMC_vrm_animation_inst := VRMC_vrm_animation.new()

const vrm_options_post_import_plugin = preload("./vrm_options_post_import_plugin.gd")
var vrm_options_post_import_plugin_inst := vrm_options_post_import_plugin.new()

const vrm_meta_class = preload("./vrm_meta.gd")
const vrm_top_level = preload("./vrm_toplevel.gd")
const vrm_secondary = preload("./vrm_secondary.gd")

#const vrm_export_extension = preload("./1.0/vrm_export_extension.gd")
#var vrm_export_extension_inst = vrm_export_extension.new()

const export_as_item: String = "VRM 1.0 Avatar..."
const export_as_id: int = 0x56524d31  # 'VRM1'

var file_export_lib: EditorFileDialog
var accept_dialog: AcceptDialog

var selected_nodes: Array[Node]
var current_export_node: Node


func _export_vrm_pressed():
	var root = get_tree().get_edited_scene_root()
	if not root:
		accept_dialog.dialog_text = "VRM Export can't be done without a scene."
		accept_dialog.ok_button_text = "OK"
		get_editor_interface().popup_dialog_centered(accept_dialog)
		return

	selected_nodes = get_editor_interface().get_selection().get_selected_nodes()
	for selnode in selected_nodes:
		if selnode.script != vrm_top_level:
			var bleh: Array[Node]
			selected_nodes = bleh
			break
	var next_filename: String = ""
	if selected_nodes.is_empty():
		var bleh: Array[Node]
		selected_nodes = bleh
		selected_nodes.append(get_tree().get_edited_scene_root())
		var filename: String = root.get_scene_file_path().get_file().get_basename()
		if filename.is_empty():
			filename = root.get_name()
		next_filename = filename + ".vrm"
	for node in selected_nodes:
		if node.script != vrm_top_level:
			accept_dialog.dialog_text = "VRM Export requires the selected or top-level node to contain a vrm_top_level script with meta."
			accept_dialog.ok_button_text = "OK"
			get_editor_interface().popup_dialog_centered(accept_dialog)
			selected_nodes.clear()
			break
		var meta: vrm_meta_class = node.vrm_meta
		var failed_validate: PackedStringArray = VRMC_vrm._validate_meta(meta)
		if node.vrm_meta == null:
			node.vrm_meta = vrm_meta_class.new()
		if not failed_validate.is_empty():
			var res_path = meta.resource_path.split("::")[0]
			if not res_path.is_empty() and (not res_path.begins_with("res://") or FileAccess.file_exists(res_path + ".import")):
				node.vrm_meta = node.vrm_meta.duplicate(true)
			get_editor_interface().inspect_object(node.vrm_meta)
			accept_dialog.dialog_text = "VRM Export requires filling out license dropdowns and basic data:\n" + ",".join(failed_validate) + "\n\nExpand CLICK TO SEE METADATA in the Inspector"
			accept_dialog.ok_button_text = "OK"
			get_editor_interface().popup_dialog_centered(accept_dialog)
			selected_nodes.clear()
			break
	_popup_next_node_export(next_filename)


func _popup_next_node_export(next_filename: String = ""):
	if not selected_nodes.is_empty():
		current_export_node = selected_nodes[-1]
		selected_nodes.pop_back()
		var filename: String = next_filename
		if filename.is_empty():
			filename = current_export_node.get_name()
		file_export_lib.set_current_file(filename + ".vrm")
		file_export_lib.popup_centered_ratio()


func reassign_owner(new_owner: Node, orig_node: Node, node: Node):
	if node == new_owner or orig_node == null:
		pass
	elif orig_node.owner == null:
		node.get_parent().remove_child(node)
		node.queue_free()
		return
	else:
		node.owner = new_owner
		#print(node.name + " assigned to owner " + node.owner.name)
	#print("Node " + str(node.name) + " orig child " + str(orig_node.get_child_count()) + " new child " + str(node.get_child_count()))
	for i in range(node.get_child_count() - 1, -1, -1):
		reassign_owner(new_owner, orig_node.get_child(i), node.get_child(i))


func remove_internals(node: Node, to_reparent: Dictionary):
	for chld in node.get_children():
		if chld.owner == null:
			to_reparent[chld] = node
			node.remove_child(chld)
		else:
			remove_internals(chld, to_reparent)


func _export_vrm_dialog_action(path: String):
	var root: Node = current_export_node
	current_export_node = null
	if root.script != vrm_top_level:
		accept_dialog.dialog_text = "VRM Export requires the selected or top-level node to contain a vrm_top_level script with meta."
		accept_dialog.ok_button_text = "OK"
		get_editor_interface().popup_dialog_centered(accept_dialog)
		return
	print("Before duplicate")
	var to_reparent: Dictionary = {}
	# Before:
	# ERROR: Index p_index = 4 is out of bounds ((int)data.children_cache.size() - data.internal_children_front_count_cache - data.internal_children_back_count_cache = 3).
	# at: Node::get_child (scene\main\node.cpp:1511)
	remove_internals(root, to_reparent)
	var new_root: Node = root.duplicate(Node.DUPLICATE_SIGNALS | Node.DUPLICATE_GROUPS | Node.DUPLICATE_SCRIPTS)
	for chld in to_reparent:
		to_reparent[chld].add_child(chld)
	reassign_owner(new_root, root, new_root)
	root = new_root
	print("After duplicate")
	var secondary := root.get_node_or_null("secondary") as Node3D
	if secondary == null:
		secondary = Node3D.new()
		secondary.owner = root
		root.add_child(secondary)
	if secondary.script == null:
		secondary.script = vrm_secondary

	var gltf_doc := GLTFDocument.new()
	gltf_doc.set(&"root_node_mode", 2) # GLTFDocument.ROOT_NODE_MODE_MULTI_ROOT
	var gltf_state := GLTFState.new()
	gltf_state.set_meta("vrm", "1.0")
	var flags := EditorSceneFormatImporter.IMPORT_USE_NAMED_SKIN_BINDS
	print("Do append_from_scene")
	if gltf_doc.append_from_scene(root, gltf_state, flags) != OK:
		push_error("VRM scene save error!")
	print("Do write_to_filesystem")
	var tmp_filename: String = path + ".tmp.glb"
	if gltf_doc.write_to_filesystem(gltf_state, tmp_filename) != OK:
		push_error("VRM scene save error!")
	var da: DirAccess = DirAccess.open("res://")
	da.rename(tmp_filename, path)
	print("All done!")
	root.queue_free()
	_popup_next_node_export()
	print(path)

	if ProjectSettings.localize_path(path) != "":
		get_editor_interface().get_resource_filesystem().update_file(path)
		get_editor_interface().get_resource_filesystem().reimport_files(PackedStringArray([path]))


func _enter_tree() -> void:
	accept_dialog = AcceptDialog.new()
	if accept_dialog.has_method(&"set_unparent_when_invisible"):
		accept_dialog.set_unparent_when_invisible(true)

	file_export_lib = EditorFileDialog.new()
	# get_gui_base().
	get_editor_interface().get_base_control().add_child(file_export_lib)
	file_export_lib.file_selected.connect(_export_vrm_dialog_action)
	file_export_lib.set_title("Export VRM File")
	file_export_lib.set_file_mode(EditorFileDialog.FILE_MODE_SAVE_FILE)
	file_export_lib.set_access(EditorFileDialog.ACCESS_FILESYSTEM)
	file_export_lib.clear_filters()
	file_export_lib.add_filter("*.vrm")
	file_export_lib.set_title("Export Scene to VRM 1.0 File")

	var export_as_menu: PopupMenu = get_export_as_menu()
	if export_as_menu != null:
		for i in range(export_as_menu.item_count - 1, -1, -1):
			if export_as_menu.get_item_text(i) == export_as_item:
				export_as_menu.remove_item(i)
	export_as_menu.add_item(export_as_item, export_as_id, KEY_V)
	export_as_menu.set_item_metadata(export_as_menu.item_count - 1, _export_vrm_pressed)

	add_scene_post_import_plugin(vrm_options_post_import_plugin_inst)
	# NOTE: Be sure to also register at runtime if you want runtime import.
	# This editor plugin script won't run outside of the editor.
	GLTFDocument.register_gltf_document_extension(VRMC_vrm_inst)
	GLTFDocument.register_gltf_document_extension(VRMC_node_constraint_inst)
	GLTFDocument.register_gltf_document_extension(VRMC_springBone_inst)
	GLTFDocument.register_gltf_document_extension(VRMC_materials_hdr_emissiveMultiplier_inst)
	GLTFDocument.register_gltf_document_extension(VRMC_materials_mtoon_inst)
	#GLTFDocument.register_gltf_document_extension(VRMC_vrm_animation_inst)
	import_plugin = preload("./import_vrm.gd").new()
	add_scene_format_importer_plugin(import_plugin)


func _exit_tree() -> void:
	accept_dialog.queue_free()
	file_export_lib.queue_free()
	var export_as_menu: PopupMenu = get_export_as_menu()
	if export_as_menu != null:
		for i in range(export_as_menu.item_count - 1, -1, -1):
			if export_as_menu.get_item_text(i) == export_as_item:
				export_as_menu.remove_item(i)
	GLTFDocument.unregister_gltf_document_extension(VRMC_vrm_inst)
	GLTFDocument.unregister_gltf_document_extension(VRMC_node_constraint_inst)
	GLTFDocument.unregister_gltf_document_extension(VRMC_springBone_inst)
	GLTFDocument.unregister_gltf_document_extension(VRMC_materials_mtoon_inst)
	GLTFDocument.unregister_gltf_document_extension(VRMC_materials_hdr_emissiveMultiplier_inst)
	#GLTFDocument.unregister_gltf_document_extension(VRMC_vrm_animation_inst)
	remove_scene_format_importer_plugin(import_plugin)
	remove_scene_post_import_plugin(vrm_options_post_import_plugin_inst)
	import_plugin = null
