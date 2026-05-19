extends GLTFDocumentExtension


func _import_preflight(state: GLTFState, extensions = PackedStringArray()) -> Error:
	if extensions.has("VRMC_materials_hdr_emissiveMultiplier") or extensions.has("KHR_materials_emissive_strength"):
		return OK
	return ERR_INVALID_DATA


# Called when the node enters the scene tree for the first time.
func _import_post(state, root):
	var materials = state.materials
	for i in range(materials.size()):
		var material: Material = materials[i]
		if material is BaseMaterial3D:
			var json_material = state.json["materials"][i]
			var extensions: Dictionary = json_material.get("extensions", {})
			var vrmc_emissive: Dictionary = extensions.get("VRMC_materials_hdr_emissiveMultiplier", {})
			var khr_emissive: Dictionary = extensions.get("KHR_materials_emissive_strength", {})
			if khr_emissive.has("emissiveStrength"):
				material.emission_energy_multiplier = khr_emissive["emissiveStrength"]
			elif vrmc_emissive.has("emissiveMultiplier"):
				material.emission_energy_multiplier = vrmc_emissive["emissiveMultiplier"]


func _export(state: GLTFState, extensions = PackedStringArray()) -> Error:
	if extensions.has("VRMC_materials_hdr_emissiveMultiplier") or extensions.has("KHR_materials_emissive_strength"):
		return OK
	return ERR_INVALID_DATA


# Called when the node enters the scene tree for the first time.
func _export_post(state: GLTFState):
	var materials = state.materials
	for i in range(materials.size()):
		var material: Material = materials[i]
		if material is BaseMaterial3D:
			var json_material: Dictionary = state.json["materials"][i]
			if !is_equal_approx(material.emission_energy_multiplier, 1.0):
				state.add_used_extension("KHR_materials_emissive_strength", false)
				if "extensions" not in json_material:
					json_material["extensions"] = {}
				json_material["extensions"]["KHR_materials_emissive_strength"] = {
					"emissiveStrength": material.emission_energy_multiplier,
				}
