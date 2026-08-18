extends GLTFDocumentExtension

const vrm_constants_class = preload("../vrm_constants.gd")
const vrm_meta_class = preload("../vrm_meta.gd")
const vrm_secondary = preload("../vrm_secondary.gd")
const vrm_top_level = preload("../vrm_toplevel.gd")

const vrm_spring_bone = preload("../vrm_spring_bone.gd")
const vrm_collider_group = preload("../vrm_collider_group.gd")
const vrm_collider = preload("../vrm_collider.gd")


func _get_skel_godot_node(gstate: GLTFState, nodes: Array, _skeletons: Array, skel_id: int) -> Node:
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


func _adjust_magnitude(pfa: PackedFloat64Array, scale: float):
	if len(pfa) > 0:
		if pfa.count(pfa[0]) == len(pfa):
			pfa.clear()
		if not is_zero_approx(scale):
			for i in range(len(pfa)):
				pfa[i] = pfa[i] / scale


func _parse_secondary_node(secondary_node: Node, vrm_extension: Dictionary, gstate: GLTFState) -> void:
	var nodes = gstate.get_nodes()
	var skeletons = gstate.get_skeletons()
	var skeleton: Skeleton3D = null
	if secondary_node.owner == null:
		skeleton = secondary_node.get_parent().get_node("%GeneralSkeleton")
	else:
		skeleton = secondary_node.owner.get_node("%GeneralSkeleton")

	var colliders: Array[vrm_collider] = []
	var collider_groups: Array[vrm_collider_group] = []

	for collider_gltf in vrm_extension.get("colliders", []):
		var gltfnode: GLTFNode = nodes[int(collider_gltf["node"])]
		var collider = vrm_collider.new()
		var pose_diff: Basis = Basis()
		if gltfnode.skeleton == -1 or skeleton == null:
			var found_node: Node = gstate.get_scene_node(int(collider_gltf["node"]))
			collider.node_path = secondary_node.get_path_to(found_node)
			collider.bone = ""
			collider.resource_name = found_node.name
		else:
			if skeleton != _get_skel_godot_node(gstate, nodes, skeletons, gltfnode.skeleton):
				push_error("VRM1: collider points to differnt skeleton")
			collider.bone = nodes[int(collider_gltf["node"])].resource_name
			collider.resource_name = collider.bone
			if skeleton.has_meta("vrm_pose_diffs"):
				# array by bone idx.
				var bone_idx: int = skeleton.find_bone(collider.bone)
				if bone_idx == -1:
					push_error("Unrecognized bone " + str(bone_idx) + " used by springBone")
				pose_diff = skeleton.get_meta("vrm_pose_diffs")[bone_idx]
			#print(str(collider.bone) + " diff " + str(pose_diff))

		if collider_gltf.has("name"):
			collider.resource_name = collider_gltf["name"]

		var collider_shape = collider_gltf["shape"]
		var is_capsule = false
		var radius: float
		var offset_gltf: Array = [0.0, 0.0, 0.0]
		var tail_gltf: Array = [0.0, 0.0, 0.0]
		if collider_shape.has("sphere"):
			radius = collider_shape["sphere"]["radius"]
			offset_gltf = collider_shape["sphere"]["offset"]
			tail_gltf = offset_gltf
		if collider_shape.has("capsule"):
			is_capsule = true
			radius = collider_shape["capsule"]["radius"]
			offset_gltf = collider_shape["capsule"]["offset"]
			tail_gltf = collider_shape["capsule"]["tail"]
		var offset: Vector3 = Vector3(offset_gltf[0], offset_gltf[1], offset_gltf[2])
		var tail: Vector3 = Vector3(tail_gltf[0], tail_gltf[1], tail_gltf[2])
		var local_pos: Vector3 = pose_diff * offset
		var local_tail_pos: Vector3 = pose_diff * tail
		collider.offset = local_pos
		collider.tail = local_tail_pos
		collider.radius = radius
		collider.is_capsule = is_capsule
		colliders.append(collider)

	for cgroup in vrm_extension.get("colliderGroups", []):
		var collider_group: vrm_collider_group = vrm_collider_group.new()
		collider_group.colliders.clear()

		for collider_node in cgroup["colliders"]:
			if collider_node < len(colliders):
				collider_group.colliders.append(colliders[int(collider_node)])
		collider_groups.append(collider_group)

	var spring_bones: Array[vrm_spring_bone] = []
	for sbone in vrm_extension.get("springs", []):
		if sbone.get("joints", []).size() == 0:
			continue
		var first_joint: Dictionary = sbone["joints"][0]
		var first_bone_node: int = int(first_joint["node"])
		var gltfnode: GLTFNode = nodes[int(first_bone_node)]
		if skeleton != _get_skel_godot_node(gstate, nodes, skeletons, gltfnode.skeleton):
			push_error("VRM1: spring joint points to differnt skeleton")

		var spring_bone: vrm_spring_bone = vrm_spring_bone.new()
		spring_bone.comment = sbone.get("name", "")
		spring_bone.hit_radius_scale = 0
		spring_bone.stiffness_scale = 0
		spring_bone.gravity_scale = 0
		spring_bone.drag_force_scale = 0
		for sjoint in sbone["joints"]:
			spring_bone.hit_radius.append(float(sjoint.get("hitRadius", 0.0)))
			spring_bone.hit_radius_scale = max(spring_bone.hit_radius_scale, spring_bone.hit_radius[-1])
			spring_bone.stiffness_force.append(float(sjoint.get("stiffiness", 1.0)))
			spring_bone.stiffness_scale = max(spring_bone.stiffness_scale, spring_bone.stiffness_force[-1])
			spring_bone.gravity_power.append(float(sjoint.get("gravityPower", 0.0)))
			spring_bone.gravity_scale = max(spring_bone.gravity_scale, spring_bone.gravity_power[-1])
			var gravity_dir = sjoint.get("gravityDir", [0.0, -1.0, 0.0])
			spring_bone.gravity_dir.append(Vector3(gravity_dir[0], gravity_dir[1], gravity_dir[2]))
			spring_bone.drag_force.append(float(sjoint.get("dragForce", 0.5)))
			spring_bone.drag_force_scale = max(spring_bone.drag_force_scale, spring_bone.drag_force[-1])

			var bone_node: int = sjoint["node"]
			var bone_name: String = nodes[int(bone_node)].resource_name
			if skeleton == null or skeleton.find_bone(bone_name) == -1:
				# Note that we make an assumption that a given SpringBone object is
				# only part of a single Skeleton*. This error might print if a given
				# SpringBone references bones from multiple Skeleton's.
				printerr("Failed to find node " + str(bone_node) + " in skel " + str(skeleton))
			else:
				spring_bone.joint_nodes.append(bone_name)

		_adjust_magnitude(spring_bone.hit_radius, spring_bone.hit_radius_scale)
		_adjust_magnitude(spring_bone.stiffness_force, spring_bone.stiffness_scale)
		_adjust_magnitude(spring_bone.gravity_power, spring_bone.gravity_scale)
		_adjust_magnitude(spring_bone.drag_force, spring_bone.drag_force_scale)

		if len(spring_bone.gravity_dir) > 0:
			spring_bone.gravity_dir_default = spring_bone.gravity_dir[0]
			if spring_bone.gravity_dir.count(spring_bone.gravity_dir_default) == len(spring_bone.gravity_dir):
				spring_bone.gravity_dir.clear()

		if not spring_bone.comment.is_empty():
			spring_bone.resource_name = spring_bone.comment.split("\n")[0]
		else:
			spring_bone.resource_name = nodes[int(first_bone_node)].resource_name

		spring_bone.collider_groups.clear()
		for cgroup_idx in sbone.get("colliderGroups", []):
			spring_bone.collider_groups.append(collider_groups[int(cgroup_idx)])

		# Center commonly points outside of the glTF Skeleton, such as the root node.
		spring_bone.center_node = NodePath()
		spring_bone.center_bone = ""
		var center_node_idx = sbone.get("center", -1)
		if center_node_idx != -1:
			var center_gltfnode: GLTFNode = nodes[int(center_node_idx)]
			var bone_name: String = center_gltfnode.resource_name
			if skeleton != null and center_gltfnode.skeleton == gltfnode.skeleton and skeleton.find_bone(bone_name) != -1:
				spring_bone.center_bone = bone_name
				spring_bone.center_node = NodePath()
			else:
				spring_bone.center_bone = ""
				spring_bone.center_node = (secondary_node.get_path_to(gstate.get_scene_node(int(center_node_idx))))
				if spring_bone.center_node == NodePath():
					printerr("Failed to find center scene node " + str(center_node_idx))
					spring_bone.center_node = secondary_node.get_path_to(secondary_node)  # Fallback

		spring_bones.append(spring_bone)

	secondary_node.set_script(vrm_secondary)
	secondary_node.set("skeleton", secondary_node.get_path_to(skeleton))
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
	var vrm_extension: Dictionary = obj.get("extensions", {}).get("VRMC_springBone", {})
	var new_joints_set = {}.duplicate()

	for bone_group in vrm_extension.get("springs", []):
		for joint in bone_group["joints"]:
			_add_joints_recursive(new_joints_set, obj["nodes"], joint["node"], true)

	for collider_group in vrm_extension.get("colliders", []):
		if int(collider_group["node"]) >= 0:
			new_joints_set[int(collider_group["node"])] = true

	_add_joint_set_as_skin(obj, new_joints_set)

	return true


func _import_preflight(state: GLTFState, extensions = PackedStringArray()) -> Error:
	if not extensions.has("VRMC_springBone"):
		return ERR_INVALID_DATA
	var gltf_json_parsed: Dictionary = state.json
	if not _add_vrm_nodes_to_skin(gltf_json_parsed):
		push_error("Failed to find required VRMC_springBone extension properties in json")
		return ERR_INVALID_DATA
	return OK


# Called when the node enters the scene tree for the first time.
func _import_post(state: GLTFState, root_node: Node):
	var gltf_json: Dictionary = state.json
	var vrm_extension: Dictionary = gltf_json["extensions"]["VRMC_springBone"]
	if vrm_extension.get("specVersion", "") != "1.0":
		push_warning("Unsupported VRMC_springBone specVersion " + str(vrm_extension.get("specVersion", "")))

	var secondary_node: Node
	if root_node.has_node("secondary"):
		secondary_node = root_node.get_node("secondary")
	else:
		secondary_node = Node3D.new()
		root_node.add_child(secondary_node, true)
		secondary_node.set_owner(root_node)
		secondary_node.set_name("secondary")

	_parse_secondary_node(secondary_node, vrm_extension, state)
	return OK


func _export_preflight(state: GLTFState, root: Node):
	if not root.has_node("secondary"):
		print("No secondary node")
		return ERR_INVALID_DATA
	var secondary = root.get_node("secondary")
	if secondary.get_script() != vrm_secondary:
		print("Incorrect secondary node script")
		return ERR_INVALID_DATA
	state.add_used_extension("VRMC_springBone", false)
	state.set_additional_data("VRMC_springBone", secondary)
	#secondary_node.set_script(vrm_secondary)
	#secondary_node.set("spring_bones", spring_bones)
	#secondary_node.set("collider_groups", collider_groups)
	return OK


static func _get_humanoid_skel(root_node: Node3D) -> Skeleton3D:
	var humanoid_skeleton: Skeleton3D
	if root_node.has_node("%GeneralSkeleton"):
		humanoid_skeleton = root_node.get_node("%GeneralSkeleton")
	else:
		var skels: Array[Node] = root_node.find_children("*", "Skeleton3D", true)
		if not skels.is_empty():
			humanoid_skeleton = skels[0]
	return humanoid_skeleton


func _export_post(state: GLTFState):
	var secondary: vrm_secondary = state.get_additional_data("VRMC_springBone")
	var collider_groups: Array[vrm_collider_group]
	var spring_bones: Array[vrm_spring_bone] = secondary.spring_bones
	var skel: Skeleton3D = secondary.get_node(secondary.skeleton)

	var unique_collider_groups: Dictionary = {}
	var unique_colliders: Dictionary = {}
	var colliders: Array[vrm_collider] = []
	for current_spring in spring_bones:
		for collider_group in current_spring.collider_groups:
			if unique_collider_groups.has(collider_group):
				continue
			unique_collider_groups[collider_group] = true
			collider_groups.append(collider_group)
			for collider in collider_group.colliders:
				if collider not in unique_colliders:
					unique_colliders[collider] = len(colliders)
					colliders.push_back(collider)

	var json: Dictionary = state.json
	var sbone_extension: Dictionary = {}
	if not json.has("extensions"):
		json["extensions"] = {}
	json["extensions"]["VRMC_springBone"] = sbone_extension

	var skel_to_godot_bone_to_gltf_node_map: Dictionary = {}
	for skely in state.skeletons:
		skel_to_godot_bone_to_gltf_node_map[skely.get_godot_skeleton()] = skely.get_godot_bone_node()
	var godot_node_to_idx: Dictionary = {}
	var json_nodes: Array = json["nodes"]
	for i in range(len(json_nodes)):
		godot_node_to_idx[state.get_scene_node(i)] = i
	# godot_node_to_idx[secondary.get_parent()] = godot_node_to_idx[secondary]

	var json_colliders: Array = []
	for collider in colliders:
		var shape: Dictionary = {}
		if collider.is_capsule:
			shape = {
				"capsule":
				{
					"offset": [collider.offset.x, collider.offset.y, collider.offset.z],
					"radius": collider.radius,
					"tail": [collider.tail.x, collider.tail.y, collider.tail.z],
				}
			}
		else:
			shape = {
				"sphere":
				{
					"offset": [collider.offset.x, collider.offset.y, collider.offset.z],
					"radius": collider.radius,
				}
			}
		var node_idx: int
		if collider.bone != "":
			node_idx = skel_to_godot_bone_to_gltf_node_map.get(skel, {}).get(skel.find_bone(collider.bone), -1)
		else:
			# FIXME: This case should perhaps no longer be supported.
			node_idx = godot_node_to_idx.get(secondary.get_node(collider.node_path), -1)
		if node_idx == -1:
			push_warning("Unable to find spring bone collider node " + str(collider.node_path) + "/" + str(collider.bone))
			continue
		json_colliders.push_back({"node": node_idx, "shape": shape})
	sbone_extension["colliders"] = json_colliders

	var json_collider_groups: Array = []
	var collider_group_indices: Dictionary = {}
	for current_group in collider_groups:
		var json_collider_list: Array = []
		for collider in current_group.colliders:
			json_collider_list.push_back(unique_colliders[collider])
		var json_collider_group: Dictionary = {}
		json_collider_group["colliders"] = json_collider_list
		if current_group.resource_name != "":
			json_collider_group["name"] = current_group.resource_name
		collider_group_indices[current_group] = len(json_collider_groups)
		json_collider_groups.push_back(json_collider_group)
	sbone_extension["colliderGroups"] = json_collider_groups

	var json_springs: Array = []
	for springbone in spring_bones:
		var spring: Dictionary = {}
		# var skeleton_node: Skeleton3D = secondary.get_node(secondary.skeleton)
		if springbone.resource_name != "":
			spring["name"] = springbone.resource_name
		if springbone.center_node == NodePath() and springbone.center_bone == "":
			pass
		elif springbone.center_node == NodePath():
			spring["center"] = skel_to_godot_bone_to_gltf_node_map[skel][skel.find_bone(springbone.center_bone)]
		else:
			spring["center"] = godot_node_to_idx[secondary.get_node(springbone.center_node)]
		var spring_groups: Array = []
		for collider_group in springbone.collider_groups:
			if collider_group_indices.has(collider_group):
				spring_groups.push_back(collider_group_indices[collider_group])
			else:
				push_warning("Missing collider_group_indices in vrm export.")
		spring["colliderGroups"] = spring_groups
		var joints: Array = []
		var prev_node_index: int = 0
		for i in range(len(springbone.joint_nodes)):
			var joint: Dictionary = {}
			if springbone.joint_nodes[i] == "":
				var node_idx = len(json_nodes)
				var delta: Vector3 = skel.get_bone_rest(skel.find_bone(springbone.joint_nodes[i - 1])).origin
				var pos: Vector3 = delta.normalized() * 0.07
				var prev_node_dict: Dictionary = json_nodes[prev_node_index]
				json_nodes.append({"name": prev_node_dict["name"] + "_end", "translation": [pos[0], pos[1], pos[2]]})
				if not prev_node_dict.has("children"):
					prev_node_dict["children"] = []
				var prev_node_children: Array = prev_node_dict["children"]
				prev_node_children.append(node_idx)
				prev_node_index = node_idx
			else:
				prev_node_index = skel_to_godot_bone_to_gltf_node_map.get(skel, {}).get(skel.find_bone(springbone.joint_nodes[i]), -1)
			if prev_node_index == -1:
				continue
			joint["node"] = prev_node_index

			var gravity_dir: Vector3 = (springbone.gravity_dir[i] if i < len(springbone.gravity_dir) else springbone.gravity_dir_default)

			var pfa: PackedFloat64Array = springbone.gravity_power
			var gravity_power: float = (1.0 if pfa.is_empty() else pfa[i] if i < len(pfa) else pfa[-1]) * springbone.gravity_scale
			pfa = springbone.stiffness_force
			var stiffness: float = springbone.stiffness_scale * (1.0 if pfa.is_empty() else pfa[i] if i < len(pfa) else pfa[-1])
			pfa = springbone.drag_force
			var drag_force: float = springbone.drag_force_scale * (1.0 if pfa.is_empty() else pfa[i] if i < len(pfa) else pfa[-1])
			pfa = springbone.hit_radius
			var hit_radius = springbone.hit_radius_scale * (1.0 if pfa.is_empty() else pfa[i] if i < len(pfa) else pfa[-1])

			if not is_zero_approx(hit_radius):
				joint["hitRadius"] = hit_radius
			if not is_equal_approx(stiffness, 1.0):
				joint["stiffness"] = stiffness
			if not is_zero_approx(gravity_power):
				joint["gravityPower"] = gravity_power
			if not gravity_dir.is_equal_approx(Vector3(0, -1, 0)) and not is_zero_approx(gravity_power):
				joint["gravityDir"] = [gravity_dir[0], gravity_dir[1], gravity_dir[2]]
			if not is_equal_approx(drag_force, 0.5):
				joint["dragForce"] = drag_force
			joints.push_back(joint)
		if len(joints) < 2:
			push_warning("Unable to resolve vrm springbone joints " + ','.join(springbone.joint_nodes))
			continue
		spring["joints"] = joints
		json_springs.push_back(spring)
	sbone_extension["springs"] = json_springs
	sbone_extension["specVersion"] = "1.0"
