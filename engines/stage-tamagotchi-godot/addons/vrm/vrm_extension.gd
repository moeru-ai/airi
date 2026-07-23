extends GLTFDocumentExtension

const vrm_constants_class = preload("./vrm_constants.gd")
const vrm_meta_class = preload("./vrm_meta.gd")
const vrm_secondary = preload("./vrm_secondary.gd")
const vrm_collider_group = preload("./vrm_collider_group.gd")
const vrm_collider = preload("./vrm_collider.gd")
const vrm_spring_bone = preload("./vrm_spring_bone.gd")
const vrm_top_level = preload("./vrm_toplevel.gd")

const importer_mesh_attributes = preload("./importer_mesh_attributes.gd")

const vrm_utils = preload("./vrm_utils.gd")

var vrm_meta: Resource = null

enum DebugMode {
	None = 0,
	Normal = 1,
	LitShadeRate = 2,
}

enum OutlineColorMode {
	FixedColor = 0,
	MixedLight3Ding = 1,
}

enum OutlineWidthMode {
	None = 0,
	WorldCoordinates = 1,
	ScreenCoordinates = 2,
}

enum RenderMode {
	Opaque = 0,
	Cutout = 1,
	Transparent = 2,
	TransparentWithZWrite = 3,
}

enum CullMode {
	Off = 0,
	Front = 1,
	Back = 2,
}

enum FirstPersonFlag {
	Auto,  # Create headlessModel
	Both,  # Default layer
	ThirdPersonOnly,
	FirstPersonOnly,
}
const FirstPersonParser: Dictionary = {
	"Auto": FirstPersonFlag.Auto,
	"Both": FirstPersonFlag.Both,
	"FirstPersonOnly": FirstPersonFlag.FirstPersonOnly,
	"ThirdPersonOnly": FirstPersonFlag.ThirdPersonOnly,
}


func _process_khr_material(orig_mat: StandardMaterial3D, gltf_mat_props: Dictionary) -> Material:
	# VRM spec requires support for the KHR_materials_unlit extension.
	if gltf_mat_props.has("extensions"):
		# TODO: Implement this extension upstream.
		if gltf_mat_props["extensions"].has("KHR_materials_unlit"):
			# TODO: validate that this is sufficient.
			orig_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	return orig_mat


func _vrm_get_texture_info(gstate: GLTFState, vrm_mat_props: Dictionary, unity_tex_name: String) -> Dictionary:
	var gltf_images: Array = gstate.get_images()
	var gltf_textures: Array = gstate.get_textures()
	var texture_info: Dictionary = {}
	texture_info["tex"] = null
	texture_info["offset"] = Vector3(0.0, 0.0, 0.0)
	texture_info["scale"] = Vector3(1.0, 1.0, 1.0)
	if vrm_mat_props["textureProperties"].has(unity_tex_name):
		var mainTexId: int = vrm_mat_props["textureProperties"][unity_tex_name]
		var mainTexImageId = gltf_textures[mainTexId].src_image
		var mainTexImage: Texture2D = gltf_images[mainTexImageId]
		texture_info["tex"] = mainTexImage
	if vrm_mat_props["vectorProperties"].has(unity_tex_name):
		var offsetScale: Array = vrm_mat_props["vectorProperties"][unity_tex_name]
		texture_info["offset"] = Vector3(offsetScale[0], offsetScale[1], 0.0)
		texture_info["scale"] = Vector3(offsetScale[2], offsetScale[3], 1.0)
	return texture_info


func _vrm_get_float(vrm_mat_props: Dictionary, key: String, def: float) -> float:
	return vrm_mat_props["floatProperties"].get(key, def)


func _process_vrm_material(orig_mat: Material, gstate: GLTFState, vrm_mat_props: Dictionary) -> Material:
	var gltf_images: Array = gstate.get_images()
	var gltf_textures: Array = gstate.get_textures()

	var vrm_shader_name: String = vrm_mat_props["shader"]
	if vrm_shader_name == "VRM_USE_GLTFSHADER":
		return orig_mat  # It's already correct!

	if vrm_shader_name == "Standard" or vrm_shader_name == "UniGLTF/UniUnlit":
		printerr("Unsupported legacy VRM shader " + vrm_shader_name + " on material " + str(orig_mat.resource_name))
		return orig_mat

	var maintex_info: Dictionary = _vrm_get_texture_info(gstate, vrm_mat_props, "_MainTex")

	if vrm_shader_name == "VRM/UnlitTransparentZWrite" or vrm_shader_name == "VRM/UnlitTransparent" or vrm_shader_name == "VRM/UnlitTexture" or vrm_shader_name == "VRM/UnlitCutout":
		if maintex_info["tex"] != null:
			orig_mat.albedo_texture = maintex_info["tex"]
			orig_mat.uv1_offset = maintex_info["offset"]
			orig_mat.uv1_scale = maintex_info["scale"]
		orig_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		if vrm_shader_name == "VRM/UnlitTransparentZWrite":
			orig_mat.depth_draw_mode = StandardMaterial3D.DEPTH_DRAW_ALWAYS
		orig_mat.no_depth_test = false
		if vrm_shader_name == "VRM/UnlitTransparent" or vrm_shader_name == "VRM/UnlitTransparentZWrite":
			orig_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			orig_mat.blend_mode = StandardMaterial3D.BLEND_MODE_MIX
		if vrm_shader_name == "VRM/UnlitCutout":
			orig_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
			orig_mat.alpha_scissor_threshold = _vrm_get_float(vrm_mat_props, "_Cutoff", 0.5)
		return orig_mat

	if vrm_shader_name != "VRM/MToon":
		printerr("Unknown VRM shader " + vrm_shader_name + " on material " + str(orig_mat.resource_name))
		return orig_mat

	# Enum(Off,0,Front,1,Back,2) _CullMode

	var outline_width_mode = int(vrm_mat_props["floatProperties"].get("_OutlineWidthMode", 0))
	var blend_mode = int(vrm_mat_props["floatProperties"].get("_BlendMode", 0))
	var cull_mode = int(vrm_mat_props["floatProperties"].get("_CullMode", 2))
	var outl_cull_mode = int(vrm_mat_props["floatProperties"].get("_OutlineCullMode", 1))
	if cull_mode == int(CullMode.Front) || (outl_cull_mode != int(CullMode.Front) && outline_width_mode != int(OutlineWidthMode.None)):
		printerr("VRM Material " + str(orig_mat.resource_name) + " has unsupported front-face culling mode: " + str(cull_mode) + "/" + str(outl_cull_mode))

	var mtoon_shader_base_path = "res://addons/Godot-MToon-Shader/mtoon"

	var godot_outline_shader_name = null
	if outline_width_mode != int(OutlineWidthMode.None):
		godot_outline_shader_name = mtoon_shader_base_path + "_outline"

	var godot_shader_name = mtoon_shader_base_path
	if blend_mode == int(RenderMode.Opaque):
		if cull_mode == int(CullMode.Off):
			godot_shader_name = mtoon_shader_base_path + "_cull_off"
	if blend_mode == int(RenderMode.Cutout):
		godot_shader_name = mtoon_shader_base_path + "_cutout"
		if cull_mode == int(CullMode.Off):
			godot_shader_name = mtoon_shader_base_path + "_cutout_cull_off"
		if godot_outline_shader_name:
			godot_outline_shader_name += "_cutout"
	elif blend_mode == int(RenderMode.Transparent):
		godot_shader_name = mtoon_shader_base_path + "_trans"
		if cull_mode == int(CullMode.Off):
			godot_shader_name = mtoon_shader_base_path + "_trans_cull_off"
		if godot_outline_shader_name:
			godot_outline_shader_name += "_trans"
	elif blend_mode == int(RenderMode.TransparentWithZWrite):
		godot_shader_name = mtoon_shader_base_path + "_trans_zwrite"
		if cull_mode == int(CullMode.Off):
			godot_shader_name = mtoon_shader_base_path + "_trans_zwrite_cull_off"
		if godot_outline_shader_name:
			godot_outline_shader_name += "_trans_zwrite"

	var godot_shader: Shader = ResourceLoader.load(godot_shader_name + ".gdshader")
	var godot_shader_outline: Shader = null
	if godot_outline_shader_name:
		godot_shader_outline = ResourceLoader.load(godot_outline_shader_name + ".gdshader")

	var new_mat: ShaderMaterial = ShaderMaterial.new()
	new_mat.resource_name = orig_mat.resource_name
	new_mat.shader = godot_shader
	var outline_mat: ShaderMaterial = null
	if godot_shader_outline == null:
		new_mat.next_pass = null
	else:
		outline_mat = ShaderMaterial.new()
		outline_mat.resource_name = orig_mat.resource_name + "_Outline"
		outline_mat.shader = godot_shader_outline
		new_mat.next_pass = outline_mat

	var texture_repeat = Vector4(maintex_info["scale"].x, maintex_info["scale"].y, maintex_info["offset"].x, maintex_info["offset"].y)
	new_mat.set_shader_parameter("_MainTex_ST", texture_repeat)
	if outline_mat != null:
		outline_mat.set_shader_parameter("_MainTex_ST", texture_repeat)

	for param_name in ["_MainTex", "_ShadeTexture", "_BumpMap", "_RimTexture", "_SphereAdd", "_EmissionMap", "_OutlineWidthTexture", "_UvAnimMaskTexture"]:
		var tex_info: Dictionary = _vrm_get_texture_info(gstate, vrm_mat_props, param_name)
		if tex_info.get("tex", null) != null:
			new_mat.set_shader_parameter(param_name, tex_info["tex"])
			if outline_mat != null:
				outline_mat.set_shader_parameter(param_name, tex_info["tex"])

			if param_name == "_SphereAdd":
				new_mat.set_shader_parameter("_MatcapColor", Color(1.0, 1.0, 1.0, 1.0))
				if outline_mat != null:
					outline_mat.set_shader_parameter("_MatcapColor", Color(1.0, 1.0, 1.0, 1.0))

	for param_name in vrm_mat_props["floatProperties"]:
		new_mat.set_shader_parameter(param_name, vrm_mat_props["floatProperties"][param_name])
		if outline_mat != null:
			outline_mat.set_shader_parameter(param_name, vrm_mat_props["floatProperties"][param_name])

	for param_name in ["_Color", "_ShadeColor", "_RimColor", "_EmissionColor", "_OutlineColor"]:
		if param_name in vrm_mat_props["vectorProperties"]:
			var param_val = vrm_mat_props["vectorProperties"][param_name]
			# TODO: Use Color for non-HDR color slots (_Color, _ShadeColor and _OutlineColor?)
			# Or, use Color for all, and split _EmissionColor into emission color and emission strength.
			var color_param: Color = Color(param_val[0], param_val[1], param_val[2], param_val[3])
			if param_name == "_RimColor":  # Marked [HDR] in MToon.shader
				color_param = color_param.linear_to_srgb()
			if param_name == "_EmissionColor":
				var mult = maxf(color_param.r, maxf(color_param.g, color_param.b))
				var emission_mult = 1.0
				if mult > 1.0:
					emission_mult = mult
					color_param = color_param / mult
				color_param = color_param.linear_to_srgb()
				new_mat.set_shader_parameter("_EmissionMultiplier", emission_mult)
				if outline_mat != null:
					outline_mat.set_shader_parameter("_EmissionMultiplier", emission_mult)
			new_mat.set_shader_parameter(param_name, color_param)
			if outline_mat != null:
				outline_mat.set_shader_parameter(param_name, color_param)

	# FIXME: setting _Cutoff to disable cutoff is a bit unusual.
	if blend_mode == int(RenderMode.Cutout):
		new_mat.set_shader_parameter("_AlphaCutoutEnable", 1.0)
		if outline_mat != null:
			outline_mat.set_shader_parameter("_AlphaCutoutEnable", 1.0)

	return new_mat


func _update_materials(vrm_extension: Dictionary, gstate: GLTFState) -> void:
	var images = gstate.get_images()
	#print(images)
	var materials: Array = gstate.get_materials()
	var spatial_to_shader_mat: Dictionary = {}

	# Render priority setup
	var render_queue_to_priority: Array = []
	var negative_render_queue_to_priority: Array = []
	var uniq_render_queues: Dictionary = {}
	negative_render_queue_to_priority.push_back(0)
	render_queue_to_priority.push_back(0)
	uniq_render_queues[0] = true
	for i in range(materials.size()):
		var oldmat: Material = materials[i]
		var vrm_mat: Dictionary = vrm_extension["materialProperties"][i]
		var delta_render_queue = vrm_mat.get("renderQueue", 3000) - 3000
		if not uniq_render_queues.has(delta_render_queue):
			uniq_render_queues[delta_render_queue] = true
			if delta_render_queue < 0:
				negative_render_queue_to_priority.push_back(-delta_render_queue)
			else:
				render_queue_to_priority.push_back(delta_render_queue)
	negative_render_queue_to_priority.sort()
	render_queue_to_priority.sort()

	# Material conversions
	for i in range(materials.size()):
		var oldmat: Material = materials[i]
		if oldmat is ShaderMaterial:
			# Indicates that the user asked to keep existing materials. Avoid changing them.
			# print("Material " + str(i) + ": " + str(oldmat.resource_name) + " already is shader.")
			continue
		var newmat: Material = _process_khr_material(oldmat, gstate.json["materials"][i])
		var vrm_mat_props: Dictionary = vrm_extension["materialProperties"][i]
		newmat = _process_vrm_material(newmat, gstate, vrm_mat_props)
		spatial_to_shader_mat[oldmat] = newmat
		spatial_to_shader_mat[newmat] = newmat
		# print("Replacing shader " + str(oldmat) + "/" + str(oldmat.resource_name) + " with " + str(newmat) + "/" + str(newmat.resource_name))
		var target_render_priority = 0
		var delta_render_queue = vrm_mat_props.get("renderQueue", 3000) - 3000
		if delta_render_queue >= 0:
			target_render_priority = render_queue_to_priority.find(delta_render_queue)
			if target_render_priority > 100:
				target_render_priority = 100
		else:
			target_render_priority = -negative_render_queue_to_priority.find(-delta_render_queue)
			if target_render_priority < -100:
				target_render_priority = -100
		# render_priority only makes sense for transparent materials.
		if newmat.get_class() == "StandardMaterial3D":
			if int(newmat.transparency) > 0:
				newmat.render_priority = target_render_priority
		else:
			var blend_mode = int(vrm_mat_props["floatProperties"].get("_BlendMode", 0))
			if blend_mode == int(RenderMode.Transparent) or blend_mode == int(RenderMode.TransparentWithZWrite):
				newmat.render_priority = target_render_priority
		materials[i] = newmat
		var oldpath = oldmat.resource_path
		if oldpath.is_empty():
			continue
		newmat.take_over_path(oldpath)
		ResourceSaver.save(newmat, oldpath)
	gstate.set_materials(materials)

	var meshes = gstate.get_meshes()
	for i in range(meshes.size()):
		var gltfmesh: GLTFMesh = meshes[i]
		var mesh = gltfmesh.mesh
		mesh.set_blend_shape_mode(Mesh.BLEND_SHAPE_MODE_NORMALIZED)
		for surf_idx in range(mesh.get_surface_count()):
			var surfmat = mesh.get_surface_material(surf_idx)
			if spatial_to_shader_mat.has(surfmat):
				mesh.set_surface_material(surf_idx, spatial_to_shader_mat[surfmat])
			else:
				printerr("Mesh " + str(i) + " material " + str(surf_idx) + " name " + str(surfmat.resource_name) + " has no replacement material.")


func _get_skel_godot_node(gstate: GLTFState, nodes: Array, skeletons: Array, skel_id: int) -> Node:
	# There's no working direct way to convert from skeleton_id to node_id.
	# Bugs:
	# GLTFNode.parent is -1 if skeleton bone.
	# skeleton_to_node is empty
	# get_scene_node(skeleton bone) works though might maybe return an attachment.
	# var skel_node_idx = nodes[gltfskel.roots[0]]
	# return gstate.get_scene_node(skel_node_idx) # as Skeleton
	for i in range(nodes.size()):
		if nodes[i].skeleton == skel_id:
			return gstate.get_scene_node(i)
	return null


func _first_person_head_hiding(vrm_extension: Dictionary, gstate: GLTFState, human_bone_to_idx: Dictionary):
	var firstperson = vrm_extension.get("firstPerson", null)

	var nodes := gstate.get_nodes()
	var skeletons := gstate.get_skeletons()
	var node_to_head_hidden_node: Dictionary = {}
	var head_relative_bones: Dictionary = {}  # To determine which meshes to hide.

	var head_bone_idx = firstperson.get("firstPersonBone", human_bone_to_idx.get("head", -1))
	if head_bone_idx >= 0:
		var headNode: GLTFNode = nodes[head_bone_idx]
		var skel: Skeleton3D = _get_skel_godot_node(gstate, nodes, skeletons, headNode.skeleton)
		vrm_utils._recurse_bones(head_relative_bones, skel, skel.find_bone(headNode.resource_name))  # FIXME: I forget if this is correct

	var mesh_annotations_by_mesh = {}
	for meshannotation in firstperson.get("meshAnnotations", []):
		var s: String = meshannotation.get("firstPersonFlag", "Auto")
		mesh_annotations_by_mesh[int(meshannotation["mesh"])] = s.substr(0, 1).to_lower() + s.substr(1)
	var mesh_annotations_by_node = {}
	for node_idx in range(len(nodes)):
		if nodes[node_idx].mesh != -1 and mesh_annotations_by_mesh.has(nodes[node_idx].mesh):
			mesh_annotations_by_node[node_idx] = mesh_annotations_by_mesh[nodes[node_idx].mesh]

	vrm_utils.perform_head_hiding(gstate, mesh_annotations_by_node, head_relative_bones, node_to_head_hidden_node)


# https://github.com/vrm-c/vrm-specification/blob/master/specification/0.0/schema/vrm.humanoid.bone.schema.json
# vrm_extension["humanoid"]["bone"]:
#"enum": ["hips","leftUpperLeg","rightUpperLeg","leftLowerLeg","rightLowerLeg","leftFoot","rightFoot",
# "spine","chest","neck","head","leftShoulder","rightShoulder","leftUpperArm","rightUpperArm",
# "leftLowerArm","rightLowerArm","leftHand","rightHand","leftToes","rightToes","leftEye","rightEye","jaw",
# "leftThumbProximal","leftThumbIntermediate","leftThumbDistal",
# "leftIndexProximal","leftIndexIntermediate","leftIndexDistal",
# "leftMiddleProximal","leftMiddleIntermediate","leftMiddleDistal",
# "leftRingProximal","leftRingIntermediate","leftRingDistal",
# "leftLittleProximal","leftLittleIntermediate","leftLittleDistal",
# "rightThumbProximal","rightThumbIntermediate","rightThumbDistal",
# "rightIndexProximal","rightIndexIntermediate","rightIndexDistal",
# "rightMiddleProximal","rightMiddleIntermediate","rightMiddleDistal",
# "rightRingProximal","rightRingIntermediate","rightRingDistal",
# "rightLittleProximal","rightLittleIntermediate","rightLittleDistal", "upperChest"]


func _create_meta(root_node: Node, animplayer: AnimationPlayer, vrm_extension: Dictionary, gstate: GLTFState, skeleton: Skeleton3D, humanBones: BoneMap, human_bone_to_idx: Dictionary, pose_diffs: Array[Basis]) -> Resource:
	var nodes = gstate.get_nodes()

	var firstperson = vrm_extension.get("firstPerson", null)
	var eyeOffset: Vector3

	if firstperson:
		# FIXME: Technically this is supposed to be offset relative to the "firstPersonBone"
		# However, firstPersonBone defaults to Head...
		# and the semantics of a VR player having their viewpoint out of something which does
		# not rotate with their head is unclear.
		# Additionally, the spec schema says this:
		# "It is assumed that an offset from the head bone to the VR headset is added."
		# Which implies that the Head bone is used, not the firstPersonBone.
		var fpboneoffsetxyz = firstperson["firstPersonBoneOffset"]  # example: 0,0.06,0
		eyeOffset = Vector3(fpboneoffsetxyz["x"], fpboneoffsetxyz["y"], fpboneoffsetxyz["z"])
		if human_bone_to_idx["head"] != -1:
			eyeOffset = pose_diffs[human_bone_to_idx["head"]] * eyeOffset
		var head_attach: BoneAttachment3D = null
		for child in skeleton.find_children("*", "BoneAttachment3D"):
			var child_attach: BoneAttachment3D = child as BoneAttachment3D
			if child_attach.bone_name == "Head":
				head_attach = child_attach
				break
		if head_attach == null:
			head_attach = BoneAttachment3D.new()
			head_attach.name = "Head"
			skeleton.add_child(head_attach)
			head_attach.owner = skeleton.owner
			head_attach.bone_name = "Head"
			var head_bone_offset: Node3D = Node3D.new()
			head_bone_offset.name = "LookOffset"
			head_attach.add_child(head_bone_offset)
			head_bone_offset.unique_name_in_owner = true
			head_bone_offset.owner = skeleton.owner
			head_bone_offset.position = eyeOffset

	vrm_meta = vrm_meta_class.new()

	vrm_meta.resource_name = "CLICK TO SEE METADATA"
	vrm_meta.exporter_version = vrm_extension.get("exporterVersion", "")
	if vrm_extension.get("specVersion", "0.0") != "0.0":
		push_warning("VRM file claims to be version " + str(vrm_extension["specVersion"]))
	vrm_meta.spec_version = "0.0"
	var vrm_extension_meta = vrm_extension.get("meta")
	if vrm_extension_meta:
		vrm_meta.title = vrm_extension["meta"].get("title", "")
		vrm_meta.version = vrm_extension["meta"].get("version", "")
		vrm_meta.authors = PackedStringArray([vrm_extension["meta"].get("author", "")])
		vrm_meta.contact_information = vrm_extension["meta"].get("contactInformation", "")
		vrm_meta.references = PackedStringArray([vrm_extension["meta"].get("reference", "")])
		var tex: int = vrm_extension["meta"].get("texture", -1)
		if tex >= 0:
			var gltftex: GLTFTexture = gstate.get_textures()[tex]
			vrm_meta.thumbnail_image = gstate.get_images()[gltftex.src_image]
		vrm_meta.allowed_user_name = vrm_extension["meta"].get("allowedUserName", "")
		vrm_meta.violent_usage = vrm_extension["meta"].get("violentUssageName", "")  # Ussage (sic.) in VRM spec
		vrm_meta.sexual_usage = vrm_extension["meta"].get("sexualUssageName", "")  # Ussage (sic.) in VRM spec
		var commercial_str = vrm_extension["meta"].get("commercialUssageName", "")  # Ussage (sic.) in VRM spec
		if commercial_str == "Allow":
			commercial_str = "AllowCorporation"
		else:
			commercial_str = "PersonalNonProfit"
		vrm_meta.commercial_usage_type = commercial_str
		vrm_meta.other_permission_url = vrm_extension["meta"].get("otherPermissionUrl", "")
		vrm_meta.license_name = vrm_extension["meta"].get("licenseName", "")
		if vrm_meta.license_name.begins_with("CC"):
			vrm_meta.allow_redistribution = "Allow"
			vrm_meta.modification = "AllowModificationRedistribution"
		if vrm_meta.license_name == "Redistribution_Prohibited":
			vrm_meta.allow_redistribution = "Disallow"
		vrm_meta.other_license_url = vrm_extension["meta"].get("otherLicenseUrl", "")

	vrm_meta.humanoid_bone_mapping = humanBones
	return vrm_meta


const vrm0_to_vrm1_presets: Dictionary = {
	"joy": "happy",
	"angry": "angry",
	"sorrow": "sad",
	"fun": "relaxed",
	"a": "aa",
	"i": "ih",
	"u": "ou",
	"e": "ee",
	"o": "oh",
	"blink": "blink",
	"blink_l": "blinkLeft",
	"blink_r": "blinkRight",
	"lookup": "lookUp",
	"lookdown": "lookDown",
	"lookleft": "lookLeft",
	"lookright": "lookRight",
	"neutral": "neutral",
}


func _create_animation_player(animplayer: AnimationPlayer, vrm_extension: Dictionary, gstate: GLTFState, human_bone_to_idx: Dictionary, pose_diffs: Array[Basis]) -> AnimationPlayer:
	# Remove all glTF animation players for safety.
	# VRM does not support animation import in this way.
	for i in range(gstate.get_animation_players_count(0)):
		var node: AnimationPlayer = gstate.get_animation_player(i)
		node.get_parent().remove_child(node)

	var animation_library: AnimationLibrary = AnimationLibrary.new()

	var meshes = gstate.get_meshes()
	var nodes = gstate.get_nodes()
	var blend_shape_groups = vrm_extension["blendShapeMaster"]["blendShapeGroups"]
	# FIXME: Do we need to handle multiple references to the same mesh???
	var mesh_idx_to_meshinstance: Dictionary = vrm_utils.generate_mesh_index_to_meshinstance_mapping(gstate)
	var material_name_to_mesh_and_surface_idx: Dictionary = {}
	for i in range(meshes.size()):
		var gltfmesh: GLTFMesh = meshes[i]
		for j in range(gltfmesh.mesh.get_surface_count()):
			material_name_to_mesh_and_surface_idx[gltfmesh.mesh.get_surface_material(j).resource_name] = [i, j]

	var firstperson = vrm_extension["firstPerson"]

	var reset_anim = Animation.new()
	reset_anim.resource_name = "RESET"

	for shape in blend_shape_groups:
		#print("Blend shape group: " + shape["name"])
		var anim = Animation.new()
		for matbind in shape["materialValues"]:
			var mesh_and_surface_idx = material_name_to_mesh_and_surface_idx[matbind["materialName"]]
			var node: ImporterMeshInstance3D = mesh_idx_to_meshinstance[mesh_and_surface_idx[0]]
			var surface_idx = mesh_and_surface_idx[1]

			var mat: Material = node.mesh.get_surface_material(surface_idx)
			var paramprop = "shader_parameter/" + matbind["propertyName"]
			var origvalue = null
			var tv = matbind["targetValue"]
			var newvalue = tv[0]

			if mat is ShaderMaterial:
				var smat: ShaderMaterial = mat
				var param = smat.get_shader_parameter(matbind["propertyName"])
				if param is Color:
					origvalue = param
					if len(tv) >= 4:
						newvalue = Color(tv[0], tv[1], tv[2], tv[3])
					else:
						printerr("Expected 4 values but got " + str(len(tv)) + " for parameter " + matbind["propertyName"] + " surface " + node.name + "/" + str(surface_idx))
						newvalue = origvalue # Filler value for consistency.
				elif matbind["propertyName"] == "_MainTex" or matbind["propertyName"] == "_MainTex_ST":
					origvalue = param
					if len(tv) >= 4:
						newvalue = (Vector4(tv[2], tv[3], tv[0], tv[1]) if matbind["propertyName"] == "_MainTex" else Vector4(tv[0], tv[1], tv[2], tv[3]))
					else:
						printerr("Expected 4 values but got " + str(len(tv)) + " for parameter " + matbind["propertyName"] + " surface " + node.name + "/" + str(surface_idx))
						newvalue = origvalue # Filler value for consistency.
				elif param is float:
					origvalue = param
					newvalue = tv[0]
				else:
					printerr("Unknown type for parameter " + matbind["propertyName"] + " surface " + node.name + "/" + str(surface_idx))

			if origvalue != null:
				var animtrack: int = anim.add_track(Animation.TYPE_VALUE)
				anim.track_set_path(animtrack, str(animplayer.get_parent().get_path_to(node)) + ":mesh:surface_" + str(surface_idx) + "/material:" + paramprop)
				anim.track_set_interpolation_type(animtrack, Animation.INTERPOLATION_NEAREST if bool(shape["isBinary"]) else Animation.INTERPOLATION_LINEAR)
				anim.track_insert_key(animtrack, 0.0, newvalue)
				animtrack = reset_anim.add_track(Animation.TYPE_VALUE)
				reset_anim.track_set_path(animtrack, str(animplayer.get_parent().get_path_to(node)) + ":mesh:surface_" + str(surface_idx) + "/material:" + paramprop)
				reset_anim.track_set_interpolation_type(animtrack, Animation.INTERPOLATION_NEAREST if bool(shape["isBinary"]) else Animation.INTERPOLATION_LINEAR)
				reset_anim.track_insert_key(animtrack, 0.0, origvalue)
		for bind in shape["binds"]:
			# FIXME: Is this a mesh_idx or a node_idx???
			var node: ImporterMeshInstance3D = mesh_idx_to_meshinstance[int(bind["mesh"])]
			var nodeMesh: ImporterMesh = node.mesh

			if nodeMesh == null || bind["index"] < 0 || bind["index"] >= nodeMesh.get_blend_shape_count():
				printerr("Invalid blend shape index in bind " + str(shape) + " for mesh " + str(node.name))
				continue
			var animtrack: int = anim.add_track(Animation.TYPE_BLEND_SHAPE)
			# nodeMesh.set_blend_shape_name(int(bind["index"]), shape["name"] + "_" + str(bind["index"]))
			anim.track_set_path(animtrack, str(animplayer.get_parent().get_path_to(node)) + ":" + str(nodeMesh.get_blend_shape_name(int(bind["index"]))))
			var interpolation: int = Animation.INTERPOLATION_LINEAR
			if shape.has("isBinary") and bool(shape["isBinary"]):
				interpolation = Animation.INTERPOLATION_NEAREST
			anim.track_set_interpolation_type(animtrack, interpolation)
			# FIXME: Godot has weird normal/tangent singularities at weight=1.0 or weight=0.5
			# So we multiply by 0.99999 to produce roughly the same output, avoiding these singularities.
			anim.track_insert_key(animtrack, 0.0, 0.99999 * float(bind["weight"]) / 100.0)
			animtrack = reset_anim.add_track(Animation.TYPE_BLEND_SHAPE)
			# nodeMesh.set_blend_shape_name(int(bind["index"]), shape["name"] + "_" + str(bind["index"]))
			reset_anim.track_set_path(animtrack, str(animplayer.get_parent().get_path_to(node)) + ":" + str(nodeMesh.get_blend_shape_name(int(bind["index"]))))
			reset_anim.track_insert_key(animtrack, 0.0, float(0.0))
			#var mesh:ArrayMesh = meshes[bind["mesh"]].mesh
			#print("Mesh name: " + mesh.resource_name)
			#print("Bind index: " + str(bind["index"]))
			#print("Bind weight: " + str(float(bind["weight"]) / 100.0))

		# https://github.com/vrm-c/vrm-specification/tree/master/specification/0.0#blendshape-name-identifier
		if vrm0_to_vrm1_presets.has(shape["presetName"]):
			anim.resource_name = vrm0_to_vrm1_presets[shape["presetName"]]
			if shape["presetName"].begins_with("look"):
				animation_library.add_animation(vrm0_to_vrm1_presets[shape["presetName"]] + "Raw", anim)
			if firstperson.get("lookAtTypeName", "") != "Bone" or not shape["presetName"].begins_with("look"):
				animation_library.add_animation(vrm0_to_vrm1_presets[shape["presetName"]], anim)
		else:
			if shape["presetName"] == "unknown":
				anim.resource_name = shape["name"]
				animation_library.add_animation(shape["name"], anim)
			else:
				push_warning("Unrecognized preset name " + str(shape))

	var skeletons: Array[GLTFSkeleton] = gstate.get_skeletons()

	var eye_bone_horizontal: Quaternion = Quaternion.from_euler(Vector3(PI / 2, 0, 0))
	if firstperson.get("lookAtTypeName", "") == "Bone":
		var horizout = firstperson["lookAtHorizontalOuter"]
		var horizin = firstperson["lookAtHorizontalInner"]
		var vertup = firstperson["lookAtVerticalUp"]
		var vertdown = firstperson["lookAtVerticalDown"]
		var lefteye: int = human_bone_to_idx.get("leftEye", -1)
		var righteye: int = human_bone_to_idx.get("rightEye", -1)
		var leftEyePath: String = ""
		var rightEyePath: String = ""
		if lefteye > 0:
			var leftEyeNode: GLTFNode = nodes[lefteye]
			var skeleton: Skeleton3D = _get_skel_godot_node(gstate, nodes, skeletons, leftEyeNode.skeleton)
			var skeletonPath: NodePath = animplayer.get_parent().get_path_to(skeleton)
			leftEyePath = (str(skeletonPath) + ":" + nodes[human_bone_to_idx["leftEye"]].resource_name)
		if righteye > 0:
			var rightEyeNode: GLTFNode = nodes[righteye]
			var skeleton: Skeleton3D = _get_skel_godot_node(gstate, nodes, skeletons, rightEyeNode.skeleton)
			var skeletonPath: NodePath = animplayer.get_parent().get_path_to(skeleton)
			rightEyePath = (str(skeletonPath) + ":" + nodes[human_bone_to_idx["rightEye"]].resource_name)

		if lefteye > 0 and righteye > 0:
			var animtrack: int = reset_anim.add_track(Animation.TYPE_ROTATION_3D)
			reset_anim.track_set_path(animtrack, leftEyePath)
			reset_anim.rotation_track_insert_key(animtrack, 0.0, eye_bone_horizontal)
			animtrack = reset_anim.add_track(Animation.TYPE_ROTATION_3D)
			reset_anim.track_set_path(animtrack, rightEyePath)
			reset_anim.rotation_track_insert_key(animtrack, 0.0, eye_bone_horizontal)

		var anim: Animation = null
		if not animplayer.has_animation("lookLeft"):
			anim = Animation.new()
			animation_library.add_animation("lookLeft", anim)
		else:
			anim = animplayer.get_animation("lookLeft")
		if anim and lefteye > 0 and righteye > 0:
			var animtrack: int = anim.add_track(Animation.TYPE_ROTATION_3D)
			anim.track_set_path(animtrack, leftEyePath)
			anim.track_set_interpolation_type(animtrack, Animation.INTERPOLATION_LINEAR)
			anim.rotation_track_insert_key(animtrack, horizout["xRange"] / 90.0, eye_bone_horizontal * (Basis(Vector3(0, 0, 1), -horizout["yRange"] * PI / 180.0)).get_rotation_quaternion())
			animtrack = anim.add_track(Animation.TYPE_ROTATION_3D)
			anim.track_set_path(animtrack, rightEyePath)
			anim.track_set_interpolation_type(animtrack, Animation.INTERPOLATION_LINEAR)
			anim.rotation_track_insert_key(animtrack, horizin["xRange"] / 90.0, eye_bone_horizontal * (Basis(Vector3(0, 0, 1), -horizin["yRange"] * PI / 180.0)).get_rotation_quaternion())

		if not animplayer.has_animation("lookRight"):
			anim = Animation.new()
			animation_library.add_animation("lookRight", anim)
		else:
			anim = animplayer.get_animation("lookRight")
		if anim and lefteye > 0 and righteye > 0:
			var animtrack: int = anim.add_track(Animation.TYPE_ROTATION_3D)
			anim.track_set_path(animtrack, leftEyePath)
			anim.track_set_interpolation_type(animtrack, Animation.INTERPOLATION_LINEAR)
			anim.rotation_track_insert_key(animtrack, horizin["xRange"] / 90.0, eye_bone_horizontal * (Basis(Vector3(0, 0, 1), horizin["yRange"] * PI / 180.0)).get_rotation_quaternion())
			animtrack = anim.add_track(Animation.TYPE_ROTATION_3D)
			anim.track_set_path(animtrack, rightEyePath)
			anim.track_set_interpolation_type(animtrack, Animation.INTERPOLATION_LINEAR)
			anim.rotation_track_insert_key(animtrack, horizout["xRange"] / 90.0, eye_bone_horizontal * (Basis(Vector3(0, 0, 1), horizout["yRange"] * PI / 180.0)).get_rotation_quaternion())

		if not animplayer.has_animation("lookUp"):
			anim = Animation.new()
			animation_library.add_animation("lookUp", anim)
		else:
			anim = animplayer.get_animation("lookUp")
		if anim and lefteye > 0 and righteye > 0:
			var animtrack: int = anim.add_track(Animation.TYPE_ROTATION_3D)
			anim.track_set_path(animtrack, leftEyePath)
			anim.track_set_interpolation_type(animtrack, Animation.INTERPOLATION_LINEAR)
			anim.rotation_track_insert_key(animtrack, vertup["xRange"] / 90.0, eye_bone_horizontal * (Basis(Vector3(1, 0, 0), -vertup["yRange"] * PI / 180.0)).get_rotation_quaternion())
			animtrack = anim.add_track(Animation.TYPE_ROTATION_3D)
			anim.track_set_path(animtrack, rightEyePath)
			anim.track_set_interpolation_type(animtrack, Animation.INTERPOLATION_LINEAR)
			anim.rotation_track_insert_key(animtrack, vertup["xRange"] / 90.0, eye_bone_horizontal * (Basis(Vector3(1, 0, 0), -vertup["yRange"] * PI / 180.0)).get_rotation_quaternion())

		if not animplayer.has_animation("lookDown"):
			anim = Animation.new()
			animation_library.add_animation("lookDown", anim)
		else:
			anim = animplayer.get_animation("lookDown")
		if anim and lefteye > 0 and righteye > 0:
			var animtrack: int = anim.add_track(Animation.TYPE_ROTATION_3D)
			anim.track_set_path(animtrack, leftEyePath)
			anim.track_set_interpolation_type(animtrack, Animation.INTERPOLATION_LINEAR)
			anim.rotation_track_insert_key(animtrack, vertdown["xRange"] / 90.0, eye_bone_horizontal * (Basis(Vector3(1, 0, 0), vertdown["yRange"] * PI / 180.0)).get_rotation_quaternion())
			animtrack = anim.add_track(Animation.TYPE_ROTATION_3D)
			anim.track_set_path(animtrack, rightEyePath)
			anim.track_set_interpolation_type(animtrack, Animation.INTERPOLATION_LINEAR)
			anim.rotation_track_insert_key(animtrack, vertdown["xRange"] / 90.0, eye_bone_horizontal * (Basis(Vector3(1, 0, 0), vertdown["yRange"] * PI / 180.0)).get_rotation_quaternion())

	animation_library.add_animation("RESET", reset_anim)
	animplayer.add_animation_library("", animation_library)
	return animplayer


func _create_joints_recursive(joint_chains: Array[PackedStringArray], skeleton: Skeleton3D, bone_idx: int, level: int, current_chain: int):
	if current_chain == -1:  # ALWAYS do this?! # and level > 0:
		current_chain = len(joint_chains)
		joint_chains.push_back(PackedStringArray())
	if current_chain != -1:
		joint_chains[current_chain].push_back(skeleton.get_bone_name(bone_idx))
	var bone_children = skeleton.get_bone_children(bone_idx)
	if bone_children.is_empty():
		if current_chain != -1:  # and len(joint_chains[current_chain]) > 0 is guaranteed true
			joint_chains[current_chain].push_back("")  # Use empty string to denote 7cm tail bone.
	else:
		for i in range(len(bone_children)):
			var child_bone: int = bone_children[i]
			if i == 0:
				_create_joints_recursive(joint_chains, skeleton, child_bone, level + 1, current_chain)
			else:
				_create_joints_recursive(joint_chains, skeleton, child_bone, 0, -1)


func _parse_secondary_node(secondary_node: Node, vrm_extension: Dictionary, gstate: GLTFState, pose_diffs: Array[Basis], is_vrm_0: bool) -> void:
	var nodes = gstate.get_nodes()
	var skeletons = gstate.get_skeletons()

	# Assume that all SpringBone are part of one skeleton for now.
	var skeleton_path: NodePath = secondary_node.get_path_to(secondary_node.get_parent().get_node("%GeneralSkeleton"))

	var offset_flip: Vector3 = Vector3(-1, 1, 1) if is_vrm_0 else Vector3(1, 1, 1)

	var collider_groups: Array[vrm_collider_group]
	for cgroup in vrm_extension["secondaryAnimation"]["colliderGroups"]:
		var gltfnode: GLTFNode = nodes[int(cgroup["node"])]
		var collider_group: vrm_collider_group = vrm_collider_group.new()
		var node_path: NodePath
		var bone: String = ""
		var new_resource_name: String = ""
		var pose_diff: Basis = Basis()
		if gltfnode.skeleton == -1:
			var found_node: Node = gstate.get_scene_node(int(cgroup["node"]))
			node_path = secondary_node.get_path_to(found_node)
			bone = ""
			new_resource_name = found_node.name
		else:
			var skeleton: Skeleton3D = _get_skel_godot_node(gstate, nodes, skeletons, gltfnode.skeleton)
			bone = nodes[int(cgroup["node"])].resource_name
			new_resource_name = bone
			pose_diff = pose_diffs[skeleton.find_bone(bone)]

		for collider_info in cgroup["colliders"]:
			var collider: vrm_collider = vrm_collider.new()
			collider.node_path = node_path
			collider.bone = bone
			collider.resource_name = new_resource_name
			var offset_obj = collider_info.get("offset", {"x": 0.0, "y": 0.0, "z": 0.0})
			var offset_vec = offset_flip * Vector3(offset_obj["x"], offset_obj["y"], offset_obj["z"])
			# beware that quat * vec * vec multiplication is not associative
			var local_pos: Vector3 = pose_diff * offset_vec
			var radius: float = collider_info.get("radius", 0.0)
			collider.is_capsule = false
			collider.offset = local_pos
			collider.tail = local_pos
			collider.radius = radius
			collider_group.colliders.append(collider)
		collider_groups.append(collider_group)

	var spring_bones: Array[vrm_spring_bone]
	for sbone in vrm_extension["secondaryAnimation"]["boneGroups"]:
		if sbone.get("bones", []).size() == 0:
			continue
		var first_bone_node: int = sbone["bones"][0]
		var gltfnode: GLTFNode = nodes[int(first_bone_node)]
		var skeleton: Skeleton3D = _get_skel_godot_node(gstate, nodes, skeletons, gltfnode.skeleton)

		if skeleton_path != secondary_node.get_path_to(skeleton):
			push_error("boneGroups somehow references a different skeleton... " + str(skeleton_path) + " vs " + str(secondary_node.get_path_to(skeleton)))
		var comment: String = sbone.get("comment", "")
		var stiffness_force = float(sbone.get("stiffiness", 1.0))
		var gravity_power = float(sbone.get("gravityPower", 0.0))
		var gravity_dir_json = sbone.get("gravityDir", {"x": 0.0, "y": -1.0, "z": 0.0})
		var gravity_dir = Vector3(gravity_dir_json["x"], gravity_dir_json["y"], gravity_dir_json["z"])
		var drag_force = float(sbone.get("dragForce", 0.4))
		var hit_radius = float(sbone.get("hitRadius", 0.02))

		var spring_collider_groups: Array[vrm_collider_group]
		for cgroup_idx in sbone.get("colliderGroups", []):
			spring_collider_groups.append(collider_groups[int(cgroup_idx)])

		# Append to indiviudal packed arrays
		var joint_chains: Array[PackedStringArray]
		for bone_node in sbone["bones"]:
			_create_joints_recursive(joint_chains, skeleton, skeleton.find_bone(nodes[int(bone_node)].resource_name), 1, -1)

		# Center commonly points outside of the glTF Skeleton, such as the root node.
		var center_node: NodePath = NodePath()
		var center_bone: String = ""
		var center_node_idx = sbone.get("center", -1)
		if center_node_idx != -1:
			var center_gltfnode: GLTFNode = nodes[int(center_node_idx)]
			var bone_name: String = center_gltfnode.resource_name
			if center_gltfnode.skeleton == gltfnode.skeleton and skeleton.find_bone(bone_name) != -1:
				center_bone = bone_name
				center_node = NodePath()
			else:
				center_bone = ""
				center_node = (secondary_node.get_path_to(gstate.get_scene_node(int(center_node_idx))))
				if center_node == NodePath():
					printerr("Failed to find center scene node " + str(center_node_idx))
					center_node = secondary_node.get_path_to(secondary_node)  # Fallback

		for chain in joint_chains:
			var spring_bone: vrm_spring_bone = vrm_spring_bone.new()
			spring_bone.comment = comment
			spring_bone.center_bone = center_bone
			spring_bone.center_node = center_node
			spring_bone.collider_groups = spring_collider_groups
			for bone_name in chain:
				spring_bone.joint_nodes.push_back(bone_name)  # end bone will be named ""
			spring_bone.stiffness_scale = stiffness_force
			spring_bone.gravity_scale = gravity_power
			spring_bone.gravity_dir_default = gravity_dir
			spring_bone.drag_force_scale = drag_force
			spring_bone.hit_radius_scale = hit_radius

			if not comment.is_empty():
				spring_bone.resource_name = comment.split("\n")[0]
			else:
				spring_bone.resource_name = chain[0]

			spring_bones.append(spring_bone)

	secondary_node.set_script(vrm_secondary)
	secondary_node.set("skeleton", skeleton_path)
	secondary_node.set("spring_bones", spring_bones)


func _add_joints_recursive(new_joints_set: Dictionary, gltf_nodes: Array, bone: int, include_child_meshes: bool = false) -> void:
	if bone < 0:
		return
	var gltf_node: Dictionary = gltf_nodes[bone]
	if not include_child_meshes and gltf_node.get("mesh", -1) != -1:
		return
	new_joints_set[bone] = true
	for child_node in gltf_node.get("children", []):
		if not new_joints_set.has(child_node):
			_add_joints_recursive(new_joints_set, gltf_nodes, int(child_node))


func _add_joint_set_as_skin(obj: Dictionary, new_joints_set: Dictionary) -> void:
	var new_joints = [].duplicate()
	for node in new_joints_set:
		new_joints.push_back(node)
	new_joints.sort()

	var new_skin: Dictionary = {"joints": new_joints}

	if not obj.has("skins"):
		obj["skins"] = [].duplicate()

	obj["skins"].push_back(new_skin)


func _add_vrm_nodes_to_skin(obj: Dictionary) -> bool:
	var vrm_extension: Dictionary = obj.get("extensions", {}).get("VRM", {})
	if not vrm_extension.has("humanoid"):
		return false
	var new_joints_set = {}.duplicate()

	var secondaryAnimation = vrm_extension.get("secondaryAnimation", {})
	for bone_group in secondaryAnimation.get("boneGroups", []):
		for bone in bone_group["bones"]:
			_add_joints_recursive(new_joints_set, obj["nodes"], int(bone), true)

	for collider_group in secondaryAnimation.get("colliderGroups", []):
		if int(collider_group["node"]) >= 0:
			new_joints_set[int(collider_group["node"])] = true

	var firstPerson = vrm_extension.get("firstPerson", {})
	if firstPerson.get("firstPersonBone", -1) >= 0:
		new_joints_set[int(firstPerson["firstPersonBone"])] = true

	for human_bone in vrm_extension["humanoid"]["humanBones"]:
		_add_joints_recursive(new_joints_set, obj["nodes"], int(human_bone["node"]), false)

	_add_joint_set_as_skin(obj, new_joints_set)

	return true


func _import_preflight(gstate: GLTFState, extensions: PackedStringArray = PackedStringArray(), psa2: Variant = null) -> Error:
	if extensions.has("VRMC_vrm"):
		# VRM 1.0 file. Do not parse as a VRM 0.0.
		return ERR_INVALID_DATA
	if typeof(gstate.get_additional_data(&"vrm/already_processed")) != TYPE_NIL:
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


func _import_post_parse(state: GLTFState) -> Error:
	var nodes := state.get_nodes()
	for n in nodes:
		if typeof(n.get_additional_data(&"GODOT_rest_transform")) == TYPE_NIL:
			n.set_additional_data(&"GODOT_rest_transform", n.get_xform())
	return OK


func _import_post(gstate: GLTFState, node: Node) -> Error:
	var gltf: GLTFDocument = GLTFDocument.new()
	var root_node: Node = node

	var is_vrm_0: bool = true

	var gltf_json: Dictionary = gstate.json
	var vrm_extension: Dictionary = gltf_json["extensions"]["VRM"]

	var human_bone_to_idx: Dictionary = {}
	# Ignoring in ["humanoid"]: armStretch, legStretch, upperArmTwist
	# lowerArmTwist, upperLegTwist, lowerLegTwist, feetSpacing,
	# and hasTranslationDoF
	for human_bone in vrm_extension["humanoid"]["humanBones"]:
		human_bone_to_idx[human_bone["bone"]] = int(human_bone["node"])
		# Unity Mecanim properties:
		# Ignoring: useDefaultValues
		# Ignoring: min
		# Ignoring: max
		# Ignoring: center
		# Ingoring: axisLength

	var skeletons = gstate.get_skeletons()
	var hipsNode: GLTFNode = gstate.nodes[human_bone_to_idx["hips"]]
	var skeleton: Skeleton3D = _get_skel_godot_node(gstate, gstate.nodes, skeletons, hipsNode.skeleton)
	var gltfnodes: Array = gstate.nodes

	var humanBones: BoneMap = BoneMap.new()
	humanBones.profile = SkeletonProfileHumanoid.new()

	var vrm_to_human_bone = vrm_constants_class.get_vrm_to_human_bone(is_vrm_0)  # vrm 0.0
	for humanBoneName in human_bone_to_idx:
		humanBones.set_skeleton_bone_name(vrm_to_human_bone[humanBoneName], gltfnodes[human_bone_to_idx[humanBoneName]].resource_name)

	if is_vrm_0:
		# VRM 0.0 has models facing backwards due to a spec error (flipped z instead of x)
		var blend_shape_names: Dictionary = vrm_utils._extract_blendshape_names(gltf_json)
		vrm_utils.rotate_scene_180(root_node, blend_shape_names, gstate)

	var do_retarget = true

	var pose_diffs: Array[Basis]
	if do_retarget:
		pose_diffs = vrm_utils.perform_retarget(gstate, root_node, skeleton, humanBones)
	else:
		# resize is busted for TypedArray and crashes Godot
		for i in range(skeleton.get_bone_count()):
			pose_diffs.append(Basis.IDENTITY)

	skeleton.set_meta("vrm_pose_diffs", pose_diffs)

	_update_materials(vrm_extension, gstate)
	_first_person_head_hiding(vrm_extension, gstate, human_bone_to_idx)

	var animplayer: AnimationPlayer
	if root_node.has_node("AnimationPlayer"):
		animplayer = root_node.get_node("AnimationPlayer")
	else:
		animplayer = AnimationPlayer.new()
		animplayer.name = "AnimationPlayer"
		root_node.add_child(animplayer, true)
		animplayer.owner = root_node

	_create_animation_player(animplayer, vrm_extension, gstate, human_bone_to_idx, pose_diffs)

	root_node.set_script(vrm_top_level)

	var vrm_meta: Resource = _create_meta(root_node, animplayer, vrm_extension, gstate, skeleton, humanBones, human_bone_to_idx, pose_diffs)
	root_node.set("vrm_meta", vrm_meta)

	if vrm_extension.has("secondaryAnimation") and (vrm_extension["secondaryAnimation"].get("colliderGroups", []).size() > 0 or vrm_extension["secondaryAnimation"].get("boneGroups", []).size() > 0):
		# NOTICE: LOCAL PATCH
		# Some VRM 0.0 exporters include secondaryAnimation data without a scene node
		# named "secondary". get_node() throws before the intended null fallback below
		# can run, so runtime import must use get_node_or_null() here.
		# Source/context: this fallback is already present in the V-Sekai VRM add-on
		# block below; the throwing lookup prevents it from being reached.
		# Removal condition: remove when the vendored add-on ships this lookup fix.
		var secondary_node: Node = root_node.get_node_or_null("secondary")
		if secondary_node == null:
			secondary_node = Node3D.new()
			root_node.add_child(secondary_node, true)
			secondary_node.set_owner(root_node)
			secondary_node.set_name("secondary")

		_parse_secondary_node(secondary_node, vrm_extension, gstate, pose_diffs, is_vrm_0)
	return OK
