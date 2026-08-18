## Attach this node in the scene and it will process the array of constraint
## resources on either bones or nodes, whatever the constraints reference.
@tool
@icon("icons/bone_node_constraint_applier.svg")
class_name BoneNodeConstraintApplier
extends Node

@export_node_path("Skeleton3D") var skeleton: NodePath:
	set(value):
		skeleton = value
		if is_inside_tree():
			_ready()

const bone_node_constraint = preload("./bone_node_constraint.gd")

@export var constraints: Array[bone_node_constraint] = []
#@export_node_path("Skeleton3D") var skeleton_node_path: NodePath = ^"%GeneralSkeleton"
#var skeleton: Skeleton3D

var skel: Skeleton3D
var internal_modifier_node: Node3D

func _ready() -> void:
	if skeleton != NodePath():
		skel = get_node(skeleton)

	for constraint in constraints:
		constraint.set_node_references_from_paths(self)
		if skel == null:
			skel = constraint.target_node as Skeleton3D
		if skel == null:
			skel = constraint.source_node as Skeleton3D

	if skel == null:
		return  # Not supported.

	if skeleton == NodePath():
		skeleton = get_path_to(skel)

	if ClassDB.class_exists(&"SkeletonModifier3D"):
		if internal_modifier_node != null:
			if internal_modifier_node.get_parent() != null:
				internal_modifier_node.get_parent().remove_child(internal_modifier_node)
			internal_modifier_node.queue_free()
		internal_modifier_node = ClassDB.instantiate("SkeletonModifier3D")
		internal_modifier_node.name = "VRM_internal_skeleton_modifier"
		skel.add_child(internal_modifier_node, false, Node.INTERNAL_MODE_BACK)
		internal_modifier_node.connect(&"modification_processed", self.do_process)

func _process(_delta: float):
	#if not ClassDB.class_exists(&"SkeletonModifier3D"):
		do_process()

func do_process() -> void:
	for constraint in constraints:
		constraint.evaluate()
