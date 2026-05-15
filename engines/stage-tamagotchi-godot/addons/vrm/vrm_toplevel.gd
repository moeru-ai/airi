@tool
class_name VRMTopLevel
extends Node3D

const vrm_meta_class = preload("./vrm_meta.gd")
const spring_bone_class = preload("./vrm_spring_bone.gd")
const collider_class = preload("./vrm_collider.gd")
const collider_group_class = preload("./vrm_collider_group.gd")

@export var vrm_meta: Resource = (func():
	var ret: vrm_meta_class = vrm_meta_class.new()
	ret.resource_name = "CLICK TO SEE METADATA"
	return ret
).call()

@export_category("Springbone Settings")
@export var update_secondary_fixed: bool = false
@export var disable_colliders: bool = false
@export var override_springbone_center: bool = false

@export var default_springbone_center: Node3D
@export var springbone_gravity_multiplier: float = 1.0
@export var springbone_gravity_rotation: Quaternion = Quaternion.IDENTITY
@export var springbone_add_force: Vector3 = Vector3.ZERO

@export_category("Run in Editor")
@export var update_in_editor: bool = false
@export var gizmo_spring_bone: bool = false
@export var gizmo_spring_bone_color: Color = Color.LIGHT_YELLOW

@export var spring_bones: Array[spring_bone_class]
@export var collider_groups: Array[collider_group_class]
@export var collider_library: Array[collider_class]
