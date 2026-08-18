@tool
class_name VRMColliderGroup
extends Resource

const vrm_collider = preload("./vrm_collider.gd")

# For organizational purposes only. At runtime, all colliders can be combined.
@export var colliders: Array[vrm_collider]
