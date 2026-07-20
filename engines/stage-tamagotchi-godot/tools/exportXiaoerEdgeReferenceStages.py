import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector


def resolve_output_dir():
    value = os.environ.get("AIRI_XIAOER_EDGE_OUT_DIR") or os.environ.get("AIRI_EDGE_LIGHT_OUT_DIR")
    if not value:
        raise RuntimeError("Set AIRI_XIAOER_EDGE_OUT_DIR to the reference stage output directory.")

    output_dir = Path(value)
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def configure_scene(scene):
    scene.use_nodes = True
    scene.render.use_compositing = True
    scene.render.use_sequencer = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100


def frame_upper_body(scene):
    camera = scene.camera
    if camera is None:
        raise RuntimeError("Scene camera not found.")

    min_v = Vector((math.inf, math.inf, math.inf))
    max_v = Vector((-math.inf, -math.inf, -math.inf))
    mesh_count = 0
    for obj in scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue

        mesh_count += 1
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            min_v.x = min(min_v.x, world.x)
            min_v.y = min(min_v.y, world.y)
            min_v.z = min(min_v.z, world.z)
            max_v.x = max(max_v.x, world.x)
            max_v.y = max(max_v.y, world.y)
            max_v.z = max(max_v.z, world.z)

    if mesh_count == 0:
        raise RuntimeError("No render-visible mesh objects found.")

    height = max_v.z - min_v.z
    target = Vector((
        (min_v.x + max_v.x) * 0.5,
        (min_v.y + max_v.y) * 0.5,
        min_v.z + height * 0.735,
    ))
    frame_span = height * 0.48
    camera.data.lens = 50
    camera.data.clip_start = 0.01
    camera.data.clip_end = 1000
    distance = frame_span / (2 * math.tan(camera.data.angle_y * 0.5)) * 1.05
    camera.location = Vector((target.x, target.y, target.z + 0.02)) + Vector((0, -1, 0)) * distance
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    return camera


def find_required_node(tree, label, predicate):
    node = next((node for node in tree.nodes if predicate(node)), None)
    if node is None:
        raise RuntimeError(f"Missing compositor node: {label}.")

    return node


def find_group_node(tree, group_name):
    return find_required_node(
        tree,
        group_name,
        lambda node: getattr(node, "node_tree", None)
        and node.node_tree
        and node.node_tree.name == group_name,
    )


def ensure_group_output_socket(tree):
    if not any(getattr(item, "in_out", None) == "OUTPUT" for item in tree.interface.items_tree):
        tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        tree.interface_update(bpy.context)

    output = find_required_node(
        tree,
        "Group Output",
        lambda node: node.bl_idname == "NodeGroupOutput",
    )
    real_inputs = [socket for socket in output.inputs if socket.type != "CUSTOM"]
    if not real_inputs:
        raise RuntimeError("Group Output has no real input socket.")

    return output, real_inputs[0]


def clear_socket(tree, socket):
    for link in list(tree.links):
        if link.to_socket == socket:
            tree.links.remove(link)


def link_once(tree, from_socket, to_socket):
    clear_socket(tree, to_socket)
    tree.links.new(from_socket, to_socket)


def render_path(scene, path):
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("AIRI_XIAOER_REFERENCE_RENDER", path)


def main():
    output_dir = resolve_output_dir()
    scene = bpy.context.scene
    configure_scene(scene)
    camera = frame_upper_body(scene)

    main_tree = scene.compositing_node_group
    if main_tree is None:
        raise RuntimeError("Scene has no compositor node group.")

    output, output_socket = ensure_group_output_socket(main_tree)
    viewer = next((node for node in main_tree.nodes if node.bl_idname == "CompositorNodeViewer"), None)
    render_layers = find_required_node(
        main_tree,
        "Render Layers",
        lambda node: node.bl_idname == "CompositorNodeRLayers",
    )
    edge_node = find_group_node(main_tree, "边缘光")
    bangs_node = find_group_node(main_tree, "刘海阴影")
    glow_node = find_group_node(main_tree, "辉光")

    def connect_final(socket):
        link_once(main_tree, socket, output_socket)
        if viewer is not None and len(viewer.inputs) > 0:
            link_once(main_tree, socket, viewer.inputs[0])

    def connect_edge_inputs():
        link_once(main_tree, render_layers.outputs["Image"], edge_node.inputs["Image"])
        link_once(main_tree, render_layers.outputs["Depth"], edge_node.inputs["深度"])
        link_once(main_tree, render_layers.outputs["法向"], edge_node.inputs["法向"])

    edge_group = edge_node.node_tree
    edge_output, edge_output_socket = ensure_group_output_socket(edge_group)
    mix_node = edge_group.nodes.get("Mix")
    mask_node = edge_group.nodes.get("Map Range.001")
    if mix_node is None or mask_node is None:
        raise RuntimeError("Edge group is missing Mix or Map Range.001.")

    def connect_edge_group_output(socket):
        link_once(edge_group, socket, edge_output_socket)

    # Raw render layer image.
    connect_final(render_layers.outputs["Image"])
    render_path(scene, output_dir / "reference_raw.png")

    # Edge node output before bangs shadow and glow.
    connect_edge_inputs()
    connect_edge_group_output(mix_node.outputs["Result"])
    connect_final(edge_node.outputs[0])
    render_path(scene, output_dir / "reference_after_edge.png")

    # Internal edge mask: Map Range.001.Result before Mix.
    connect_edge_group_output(mask_node.outputs["Result"])
    connect_final(edge_node.outputs[0])
    render_path(scene, output_dir / "reference_edge_mask.png")

    # Final enabled chain: edge -> bangs shadow -> glow.
    connect_edge_group_output(mix_node.outputs["Result"])
    connect_edge_inputs()
    link_once(main_tree, edge_node.outputs[0], bangs_node.inputs["Input"])
    link_once(main_tree, render_layers.outputs["Depth"], bangs_node.inputs["深度"])
    link_once(main_tree, render_layers.outputs["脸"], bangs_node.inputs["脸"])
    link_once(main_tree, bangs_node.outputs[0], glow_node.inputs["Input"])
    connect_final(glow_node.outputs[0])
    render_path(scene, output_dir / "reference_final_on.png")

    # Final disabled chain: bypass only the edge-light node.
    link_once(main_tree, render_layers.outputs["Image"], bangs_node.inputs["Input"])
    connect_final(glow_node.outputs[0])
    render_path(scene, output_dir / "reference_final_off.png")

    metadata = {
        "blend": bpy.data.filepath,
        "cameraLocation": [round(value, 6) for value in camera.location],
        "cameraRotationEuler": [round(value, 6) for value in camera.rotation_euler],
        "viewTransform": scene.view_settings.view_transform,
        "look": scene.view_settings.look,
        "outputSocket": {
            "main": output_socket.name,
            "edge": edge_output_socket.name,
        },
    }
    (output_dir / "reference_metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


main()
