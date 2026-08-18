@tool
class_name VRMCollider
extends Resource

# Bone name references are only valid within the given Skeleton.
# If the node was not a skeleton, bone is "" and contains a path to the node.
@export var node_path: NodePath:
	set(value):
		node_path = value
		recreate_collider.emit()

# The bone within the skeleton with the collider, or "" if not a bone.
@export var bone: String:
	set(value):
		bone = value
		emit_changed()

@export var offset: Vector3:
	set(value):
		offset = value
		emit_changed()
@export var tail: Vector3:  # if is_capsule
	set(value):
		tail = value
		emit_changed()
@export var radius: float:
	set(value):
		radius = value
		emit_changed()

@export var is_capsule: bool = false:
	set(value):
		if value != is_capsule:
			is_capsule = value
			recreate_collider.emit()

# (Array, Plane)
# Only use in editor
@export var gizmo_color: Color = Color.MAGENTA

signal recreate_collider


func create_runtime(secondary_node: Node3D, skeleton: Skeleton3D) -> VrmRuntimeCollider:
	var node: Node3D = null
	var bone_idx: int = -1
	if node_path != NodePath():
		node = secondary_node.get_node(node_path)
	if node == null and bone != "":
		bone_idx = skeleton.find_bone(bone)
	if node == null and bone_idx == -1:
		push_warning("spring collider: Unable to locate bone " + str(bone) + " or node " + str(node_path))
		node = secondary_node
	if is_capsule:
		return CapsuleCollider.new(self, bone_idx, node)
	else:
		return SphereCollider.new(self, bone_idx, node)


#func _ready(ready_parent: Node3D, ready_skel: Object):
#	self.parent = ready_parent
#	if ready_parent.get_class() == "Skeleton3D":
#		self.skel = ready_skel
#		bone_idx = ready_parent.find_bone(bone)
#	setup()

#func _process():
#	for collider in colliders:
#		collider.update(parent, skel)


class VrmRuntimeCollider:
	var collider: VRMCollider

	var bone_idx: int
	var node: Node3D
	var offset: Vector3
	var radius: float
	var position: Vector3
	var gizmo_color: Color

	func _init(p_collider: VRMCollider, p_bone_idx: int, p_node: Node3D):
		bone_idx = bone_idx
		node = p_node
		collider = p_collider
		collider.changed.connect(init)
		init()

	func init():
		bone_idx = -1
		offset = collider.offset
		radius = collider.radius

	func update(skel_global_xform_inv: Transform3D, center_transform: Transform3D, skel: Skeleton3D):
		if node == null and bone_idx == -1:
			bone_idx = skel.find_bone(collider.bone)
		if bone_idx != -1:
			position = center_transform * (skel.get_bone_global_pose(bone_idx) * offset)
		else:  # if node != null:
			position = center_transform * skel_global_xform_inv * node.global_transform * offset

	func collision(bone_position: Vector3, bone_radius: float, bone_length: float, out: Vector3, position_offset: Vector3 = Vector3.ZERO) -> Vector3:
		var this_position = self.position + position_offset
		var r = bone_radius + self.radius
		if r <= 0:
			return out
		var diff: Vector3 = out - this_position
		if diff.length_squared() <= r * r:
			# Hit, move to orientation of normal
			var normal: Vector3 = (out - this_position).normalized()
			var pos_from_collider = this_position + normal * (bone_radius + self.radius)
			# Limiting bone length
			##print("Collision hit! " + str(pos_from_collider - bone_position) + " at " + str(bone_length) + ": " + str((pos_from_collider - bone_position).normalized()) + " -> " + str((pos_from_collider - bone_position).normalized() * bone_length))
			out = bone_position + (pos_from_collider - bone_position).normalized() * bone_length
			# out = out + 1.0 * (pos_from_collider - bone_position).normalized() * bone_length
		return out


class SphereCollider:
	extends VrmRuntimeCollider

	func draw_debug(p_mesh: ImmediateMesh, p_center_transform_inv: Transform3D) -> void:
		var step: int = 15
		var sppi: float = 2 * PI / step
		var center: Vector3 = p_center_transform_inv * self.position
		var bas: Basis = p_center_transform_inv.basis
		for i in range(1, step + 1):
			p_mesh.surface_set_color(self.gizmo_color)
			p_mesh.surface_add_vertex(center + ((bas * Vector3.UP * self.radius).rotated(bas * Vector3.RIGHT, sppi * ((i - 1) % step))))
			p_mesh.surface_set_color(self.gizmo_color)
			p_mesh.surface_add_vertex(center + ((bas * Vector3.UP * self.radius).rotated(bas * Vector3.RIGHT, sppi * (i % step))))
		for i in range(1, step + 1):
			p_mesh.surface_set_color(self.gizmo_color)
			p_mesh.surface_add_vertex(center + ((bas * Vector3.RIGHT * self.radius).rotated(bas * Vector3.FORWARD, sppi * ((i - 1) % step))))
			p_mesh.surface_set_color(self.gizmo_color)
			p_mesh.surface_add_vertex(center + ((bas * Vector3.RIGHT * self.radius).rotated(bas * Vector3.FORWARD, sppi * (i % step))))
		for i in range(1, step + 1):
			p_mesh.surface_set_color(self.gizmo_color)
			p_mesh.surface_add_vertex(center + ((bas * Vector3.FORWARD * self.radius).rotated(bas * Vector3.UP, sppi * ((i - 1) % step))))
			p_mesh.surface_set_color(self.gizmo_color)
			p_mesh.surface_add_vertex(center + ((bas * Vector3.FORWARD * self.radius).rotated(bas * Vector3.UP, sppi * (i % step))))


class CapsuleCollider:
	extends VrmRuntimeCollider
	var tail_offset: Vector3
	var tail_position: Vector3

	func init():
		super.init()
		tail_offset = collider.tail

	func update(p_skel_global_xform_inv: Transform3D, p_center_transform: Transform3D, p_skel: Skeleton3D):
		if node == null and bone_idx == -1:
			bone_idx = p_skel.find_bone(collider.bone)
		if bone_idx != -1:
			position = p_center_transform * (p_skel.get_bone_global_pose(bone_idx) * offset)
			tail_position = p_center_transform * (p_skel.get_bone_global_pose(bone_idx) * tail_offset)
		else:  # if node != null
			position = p_center_transform * p_skel_global_xform_inv * node.global_transform * offset
			tail_position = p_center_transform * p_skel_global_xform_inv * node.global_transform * tail_offset

	func collision(p_bone_position: Vector3, p_bone_radius: float, p_bone_length: float, p_out: Vector3, p_position_offset: Vector3 = Vector3.ZERO) -> Vector3:
		var P: Vector3 = tail_position - position
		var Q: Vector3 = p_bone_position - position - p_position_offset
		var dot = P.dot(Q)
		if dot <= 0:
			return super.collision(p_bone_position, p_bone_radius, p_bone_length, p_out, p_position_offset)

		var t: float = dot / P.length()
		if t >= 1.0:
			return super.collision(p_bone_position, p_bone_radius, p_bone_length, p_out, p_position_offset + P)

		return super.collision(p_bone_position, p_bone_radius, p_bone_length, p_out, p_position_offset + P * t)

	func draw_debug(mesh: ImmediateMesh, center_transform_inv: Transform3D) -> void:
		var step: int = 15
		var sppi: float = 2 * PI / step
		var center: Vector3 = center_transform_inv * self.position
		var tail: Vector3 = center_transform_inv * self.tail_position
		var bas: Basis = center_transform_inv.basis

		var up_axis: Vector3 = (tail - position).normalized()
		if up_axis.is_equal_approx(Vector3.ZERO):
			up_axis = Vector3(0, 1, 0)
		var right_axis: Vector3  #= up_axis.cross(Vector3.RIGHT).normalized()
		if abs(up_axis.dot(Vector3.RIGHT)) < 0.8:
			right_axis = up_axis.cross(Vector3.RIGHT).normalized()
		elif abs(up_axis.dot(Vector3.FORWARD)) < 0.8:
			right_axis = up_axis.cross(Vector3.FORWARD).normalized()
		else:
			right_axis = up_axis.cross(Vector3.UP).normalized()
		var forward_axis: Vector3 = up_axis.cross(right_axis).normalized()
		right_axis = forward_axis.cross(up_axis).normalized()
		for i in range(1, step + 1):
			mesh.surface_set_color(self.gizmo_color)
			mesh.surface_add_vertex((center if i - 1 < step / 2 else tail) + ((bas * up_axis * self.radius).rotated(bas * right_axis, PI / 2 + sppi * ((i - 1) % step))))
			mesh.surface_set_color(self.gizmo_color)
			mesh.surface_add_vertex((center if i < step / 2 or i == step else tail) + ((bas * up_axis * self.radius).rotated(bas * right_axis, PI / 2 + sppi * (i % step))))
		for i in range(1, step + 1):
			mesh.surface_set_color(self.gizmo_color)
			mesh.surface_add_vertex((center if i - 1 < step / 2 else tail) + ((bas * right_axis * self.radius).rotated(bas * forward_axis, PI / 2 + sppi * ((i - 1) % step))))
			mesh.surface_set_color(self.gizmo_color)
			mesh.surface_add_vertex((center if i < step / 2 or i == step else tail) + ((bas * right_axis * self.radius).rotated(bas * forward_axis, PI / 2 + sppi * (i % step))))
		for i in range(1, step + 1):
			mesh.surface_set_color(self.gizmo_color)
			mesh.surface_add_vertex(center + ((bas * forward_axis * self.radius).rotated(bas * up_axis, sppi * ((i - 1) % step))))
			mesh.surface_set_color(self.gizmo_color)
			mesh.surface_add_vertex(center + ((bas * forward_axis * self.radius).rotated(bas * up_axis, sppi * (i % step))))
		for i in range(1, step + 1):
			mesh.surface_set_color(self.gizmo_color)
			mesh.surface_add_vertex(tail + ((bas * forward_axis * self.radius).rotated(bas * up_axis, sppi * ((i - 1) % step))))
			mesh.surface_set_color(self.gizmo_color)
			mesh.surface_add_vertex(tail + ((bas * forward_axis * self.radius).rotated(bas * up_axis, sppi * (i % step))))
