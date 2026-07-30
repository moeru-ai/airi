extends Node

const vrm_runtime_importer = preload("res://scripts/vrm/VrmRuntimeImporter.gd")

const SAMPLE_PATHS := [
	"res://../../packages/stage-ui/src/assets/vrm/models/AvatarSample-A/AvatarSample_A.vrm",
	"res://../../packages/stage-ui/src/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm",
]

func _ready() -> void:
	var failures: Array[String] = []

	for sample_path in SAMPLE_PATHS:
		var summary := _inspect_sample(sample_path)
		print("Material check: %s" % summary)
		_collect_sample_failures(summary, failures)

	for failure in failures:
		push_error(failure)

	get_tree().quit(1 if failures.size() > 0 else 0)


func _inspect_sample(sample_path: String) -> Dictionary:
	var importer: RefCounted = vrm_runtime_importer.new()
	var native_path := ProjectSettings.globalize_path(sample_path)
	var avatar: Node = importer.import_vrm(native_path)
	var summary := {
		"sample": sample_path.get_file(),
		"mtoon": 0,
		"cutout": 0,
		"transparent": 0,
		"outline": 0,
		"shadowCasters": 0,
		"unlit": 0,
		"error": "",
	}

	if avatar == null:
		summary["error"] = importer.get_last_error()
		return summary

	_scan_node(avatar, summary)
	avatar.free()
	return summary


func _scan_node(node: Node, summary: Dictionary) -> void:
	if node is MeshInstance3D:
		_scan_mesh_instance(node, summary)

	for child in node.get_children():
		_scan_node(child, summary)


func _scan_mesh_instance(mesh_instance: MeshInstance3D, summary: Dictionary) -> void:
	if mesh_instance.cast_shadow != GeometryInstance3D.SHADOW_CASTING_SETTING_OFF:
		summary["shadowCasters"] += 1

	if mesh_instance.mesh == null:
		return

	for surface_index in range(mesh_instance.mesh.get_surface_count()):
		var material := mesh_instance.get_surface_override_material(surface_index)
		if material == null:
			material = mesh_instance.mesh.surface_get_material(surface_index)

		_scan_material(material, summary)


func _scan_material(material: Material, summary: Dictionary) -> void:
	if material == null:
		return

	if material is StandardMaterial3D:
		if material.shading_mode == BaseMaterial3D.SHADING_MODE_UNSHADED:
			summary["unlit"] += 1
		return

	if material is not ShaderMaterial or material.shader == null:
		return

	var shader_path: String = material.shader.resource_path
	if shader_path.find("mtoon") == -1:
		return

	summary["mtoon"] += 1

	if shader_path.find("_cutout") != -1:
		summary["cutout"] += 1

	if shader_path.find("_trans") != -1:
		summary["transparent"] += 1

	if material.next_pass is ShaderMaterial and material.next_pass.shader != null:
		var outline_path: String = material.next_pass.shader.resource_path
		if outline_path.find("mtoon_outline") != -1:
			summary["outline"] += 1


func _collect_sample_failures(summary: Dictionary, failures: Array[String]) -> void:
	if not summary["error"].is_empty():
		failures.push_back("%s import failed: %s" % [summary["sample"], summary["error"]])
		return

	if summary["mtoon"] == 0:
		failures.push_back("%s did not import MToon materials." % summary["sample"])

	if summary["cutout"] == 0:
		failures.push_back("%s did not import alpha/cutout MToon materials." % summary["sample"])

	if summary["transparent"] == 0:
		failures.push_back("%s did not import transparent MToon materials." % summary["sample"])

	if summary["outline"] == 0:
		failures.push_back("%s did not import MToon outline passes." % summary["sample"])

	if summary["shadowCasters"] == 0:
		failures.push_back("%s did not expose any mesh shadow casters." % summary["sample"])
