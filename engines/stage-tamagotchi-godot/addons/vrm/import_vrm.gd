@tool
extends EditorSceneFormatImporter

const gltf_document_extension_class = preload("./vrm_extension.gd")
const vrm_constants = preload("./vrm_constants.gd")

const SAVE_DEBUG_GLTFSTATE_RES: bool = false


func _get_importer_name() -> String:
	return "Godot-VRM"


func _get_recognized_extensions() -> Array:
	return ["vrm"]


func _get_extensions() -> PackedStringArray:
	var exts: PackedStringArray
	exts.push_back("vrm")
	return exts


func _get_import_flags() -> int:
	return IMPORT_SCENE


func _import_scene(path: String, flags: int, options: Dictionary) -> Object:
	print("Import VRM: " + path + " ----------------------")
	var gltf: GLTFDocument = GLTFDocument.new()
	flags |= EditorSceneFormatImporter.IMPORT_USE_NAMED_SKIN_BINDS
	var vrm_extension: GLTFDocumentExtension = gltf_document_extension_class.new()
	gltf.register_gltf_document_extension(vrm_extension, true)
	var state: GLTFState = GLTFState.new()
	state.set_additional_data(&"vrm/head_hiding_method", options.get(&"vrm/head_hiding_method", 0) as vrm_constants.HeadHidingSetting)
	state.set_additional_data(&"vrm/first_person_layers", options.get(&"vrm/only_if_head_hiding_uses_layers/first_person_layers", 2) as int)
	state.set_additional_data(&"vrm/third_person_layers", options.get(&"vrm/only_if_head_hiding_uses_layers/third_person_layers", 4) as int)
	# HANDLE_BINARY_EMBED_AS_BASISU crashes on some files in 4.0 and 4.1
	state.handle_binary_image = GLTFState.HANDLE_BINARY_EMBED_AS_UNCOMPRESSED  # GLTFState.HANDLE_BINARY_EXTRACT_TEXTURES
	var err = gltf.append_from_file(path, state, flags)
	if err != OK:
		gltf.unregister_gltf_document_extension(vrm_extension)
		return null
	var generated_scene = gltf.generate_scene(state)
	if SAVE_DEBUG_GLTFSTATE_RES and path != "":
		if !ResourceLoader.exists(path + ".res"):
			state.take_over_path(path + ".res")
			ResourceSaver.save(state, path + ".res")
	gltf.unregister_gltf_document_extension(vrm_extension)
	return generated_scene
