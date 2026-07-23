extends "res://addons/vrm/vrm_extension.gd"

# NOTICE:
# Godot 4.6 reports an internal Dictionary::operator[] bug when
# GLTFState.get_additional_data() reads a missing key from this import preflight.
# The AIRI runtime importer seeds `vrm/already_processed` before append_from_file,
# then this extension treats only `true` as already processed. This keeps the
# V-Sekai VRM 0.x preflight behavior while avoiding the missing-key error.
# Source context:
# - `addons/vrm/vrm_extension.gd:_import_preflight`
# - Godot docs: GLTFState.get_additional_data() should return null if unset.
# Removal condition:
# - Remove when the vendored VRM add-on or Godot 4.6+ no longer emits the missing-key error.


func _import_preflight(gstate: GLTFState, extensions: PackedStringArray = PackedStringArray(), psa2: Variant = null) -> Error:
	if extensions.has("VRMC_vrm"):
		# VRM 1.0 file. Do not parse as a VRM 0.0.
		return ERR_INVALID_DATA
	if gstate.get_additional_data(&"vrm/already_processed") == true:
		return ERR_SKIP
	gstate.set_additional_data(&"vrm/already_processed", true)
	var gltf_json_parsed: Dictionary = gstate.json
	var gltf_nodes = gltf_json_parsed["nodes"]
	if not _add_vrm_nodes_to_skin(gltf_json_parsed):
		push_error("Failed to find required VRM keys in json")
		return ERR_INVALID_DATA
	for node in gltf_nodes:
		if node.get("name", "") == "Root":
			node["name"] = "Root_"
	return OK
