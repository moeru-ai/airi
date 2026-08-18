extends RefCounted

# NOTICE:
# Godot editor import plugins are not active in the exported/runtime sidecar path.
# This bridge mirrors the V-Sekai VRM add-on import flow from `addons/vrm/import_vrm.gd`
# so C# can import a materialized VRM file after Electron sends a native path.
# Remove this bridge only when the add-on exposes a stable runtime API for direct C# use.

const vrm_constants = preload("res://addons/vrm/vrm_constants.gd")
const vrm_extension_class = preload("res://scripts/vrm/AiriVrmRuntimeExtension.gd")

# NOTICE:
# Godot exposes this named-skin-bind flag through EditorSceneFormatImporter, but
# GLTFDocument also consumes the same bit during runtime append_from_file import.
# Keep the literal here because exported runtime code should not depend on the
# editor importer API.
# Source: Godot 4.6.2 `modules/gltf/gltf_document.cpp`
# `GLTF_IMPORT_USE_NAMED_SKIN_BINDS = 16`.
# Removal condition:
# - Replace with a public GLTFDocument runtime flag if Godot exposes one.
const IMPORT_USE_NAMED_SKIN_BINDS := 16

var _last_error := ""


func get_last_error() -> String:
	return _last_error


func import_vrm(path: String) -> Node:
	_last_error = ""

	if not FileAccess.file_exists(path):
		_last_error = "VRM file does not exist: %s" % path
		return null

	var gltf := GLTFDocument.new()
	var vrm_extension: GLTFDocumentExtension = vrm_extension_class.new()
	GLTFDocument.register_gltf_document_extension(vrm_extension, true)

	var state := GLTFState.new()
	state.set_additional_data(&"vrm/already_processed", false)
	state.set_additional_data(&"vrm/head_hiding_method", vrm_constants.HeadHidingSetting.ThirdPersonOnly)
	state.set_additional_data(&"vrm/first_person_layers", 2)
	state.set_additional_data(&"vrm/third_person_layers", 4)
	state.handle_binary_image = GLTFState.HANDLE_BINARY_EMBED_AS_UNCOMPRESSED

	var err := gltf.append_from_file(path, state, IMPORT_USE_NAMED_SKIN_BINDS)
	if err != OK:
		GLTFDocument.unregister_gltf_document_extension(vrm_extension)
		_last_error = "Failed to import VRM: %s" % error_string(err)
		return null

	var generated_scene := gltf.generate_scene(state)
	GLTFDocument.unregister_gltf_document_extension(vrm_extension)

	if generated_scene == null:
		_last_error = "VRM importer generated an empty scene."
		return null

	return generated_scene
