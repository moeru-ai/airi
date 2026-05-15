@tool
extends ImporterMeshInstance3D

@export var orig_layers: int:
	get:
		if typeof(get(&"layer_mask")) != TYPE_NIL:
			return get(&"layer_mask")
		return 1 # Default layer on older engine versions.

@export var orig_shadow: int:
	get:
		if typeof(get(&"cast_shadow")) != TYPE_NIL:
			return get(&"cast_shadow")
		return GeometryInstance3D.SHADOW_CASTING_SETTING_ON

@export var shadow: int = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
@export var layers: int
@export var first_person_flag: String


func _on_replacing_by(p_node: Node):
	if not (p_node is MeshInstance3D):
		push_error("ImporterMeshInstance3D was not replaced with MeshInstance3D")
	var mi: MeshInstance3D = p_node as MeshInstance3D
	mi.layers = layers
	mi.cast_shadow = shadow
	mi.set_meta("vrm_first_person_flag", first_person_flag)


func _init():
	self.replacing_by.connect(_on_replacing_by)
