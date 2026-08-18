extends RefCounted

const vrm_collider = preload("./vrm_collider.gd")

var force_update: bool = true
var bone_idx: int = -1
var parent_idx: int = -1

var radius: float = 0
var length: float = 0

var bone_axis: Vector3
var current_tail: Vector3
var prev_tail: Vector3

var initial_transform: Transform3D
var global_pose: Transform3D


static func from_to_rotation_safe(from: Vector3, to: Vector3) -> Quaternion:
	var axis: Vector3 = from.cross(to)
	if is_equal_approx(axis.x, 0.0) and is_equal_approx(axis.y, 0.0) and is_equal_approx(axis.z, 0.0):
		return Quaternion.IDENTITY
	var angle: float = from.angle_to(to)
	if is_equal_approx(angle, 0.0):
		angle = 0.0
	return Quaternion(axis.normalized(), angle)


func get_global_pose(skel: Skeleton3D) -> Transform3D:
	return skel.get_bone_global_pose(parent_idx) * skel.get_bone_pose(bone_idx)


func get_local_pose_rotation(skel: Skeleton3D) -> Quaternion:
	return get_global_pose(skel).basis.get_rotation_quaternion()


func get_global_pose_cached() -> Transform3D:
	return global_pose


func get_local_pose_rotation_cached() -> Quaternion:
	return global_pose.basis.get_rotation_quaternion()


func reset(skel: Skeleton3D) -> void:
	if not ClassDB.class_exists(&"SkeletonModifier3D"):
		skel.set_bone_global_pose_override(bone_idx, initial_transform, 1.0, true)


func _init(skel: Skeleton3D, idx: int, center_transform_inv: Transform3D, local_child_position: Vector3, default_pose: Transform3D) -> void:
	initial_transform = default_pose
	global_pose = default_pose
	bone_idx = idx
	parent_idx = skel.get_bone_parent(idx)
	var world_child_position: Vector3 = get_global_pose(skel) * local_child_position
	current_tail = center_transform_inv * world_child_position
	prev_tail = current_tail
	bone_axis = local_child_position.normalized()
	length = local_child_position.length()


func pre_update(skel: Skeleton3D) -> void:
	global_pose = get_global_pose(skel)


func update(skel: Skeleton3D, center_transform: Transform3D, center_transform_inv: Transform3D, stiffness_force: float, drag_force: float, external: Vector3, colliders: Array[vrm_collider.VrmRuntimeCollider]) -> void:
	var tmp_current_tail: Vector3 = current_tail
	var tmp_prev_tail: Vector3 = prev_tail
	if ClassDB.class_exists(&"SkeletonModifier3D"):
		global_pose = get_global_pose(skel)
	var global_pose_tr: Transform3D = get_global_pose_cached()
	var local_pose_rotation: Quaternion = get_local_pose_rotation_cached()

	# Integration of velocity verlet
	var next_tail: Vector3 = tmp_current_tail + (tmp_current_tail - tmp_prev_tail) * (1.0 - drag_force) + center_transform.basis.get_rotation_quaternion() * (local_pose_rotation * bone_axis * stiffness_force + external)

	# Limiting bone length
	var origin: Vector3 = center_transform * global_pose_tr.origin

	next_tail = origin + (next_tail - origin).normalized() * length
	#next_tail = center_transform_inv * next_tail

	# Collision movement
	for collider in colliders:
		next_tail = collider.collision(origin, radius, length, next_tail)

	# Recording current tails for next process
	prev_tail = current_tail  # center_transform_inv * current_tail
	current_tail = next_tail  # center_transform_inv * next_tail

	# Apply rotation
	var ft = from_to_rotation_safe(local_pose_rotation * (bone_axis), center_transform_inv.basis * (next_tail - origin))
	if typeof(ft) != TYPE_NIL:
		# ft = skel.global_transform.basis.get_rotation_quaternion().inverse() * ft
		var qt: Quaternion = ft * local_pose_rotation
		global_pose_tr.basis = Basis(qt).scaled(global_pose_tr.basis.get_scale()) # Scaling here avoids the most egregious artifacts in a scaled character, but this math is not correct. Use scale 1,1,1
		if ClassDB.class_exists(&"SkeletonModifier3D"):
			skel.set_bone_global_pose(bone_idx, global_pose_tr)
		else:
			skel.set_bone_global_pose_override(bone_idx, global_pose_tr, 1.0, true)
