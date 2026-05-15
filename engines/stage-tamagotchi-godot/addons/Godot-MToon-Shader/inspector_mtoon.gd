@tool
extends EditorInspectorPlugin

const mtoon: Shader = preload("mtoon.gdshader")
const mtoon_cull_off: Shader = preload("mtoon_cull_off.gdshader")
const mtoon_trans: Shader = preload("mtoon_trans.gdshader")
const mtoon_trans_cull_off: Shader = preload("mtoon_trans_cull_off.gdshader")
const mtoon_trans_zwrite: Shader = preload("mtoon_trans_zwrite.gdshader")
const mtoon_trans_zwrite_cull_off: Shader = preload("mtoon_trans_zwrite_cull_off.gdshader")
const mtoon_outline: Shader = preload("mtoon_outline.gdshader")


func _can_handle(object: Object) -> bool:
	if object != null and object is ShaderMaterial:
		if object.shader != null and object.shader.resource_path.find("/mtoon") != -1 and object.shader.resource_path.find("/mtoon_outline") == -1:
			return true
	return false


var first_property: EditorProperty = null
var last_tex_property: String = ""
var property_name_to_editor: Dictionary = {}.duplicate()

#func _dump_tree(n: Node, ind: String="") -> void:
#	print(ind + n.name)
#	for chld in n.get_children():
#		_dump_tree(chld, ind + "    ")

const color_properties: Array = ["_Color", "_ShadeColor", "_RimColor", "_EmissionColor", "_OutlineColor", "_MatcapColor"]

const property_headers: Dictionary = {
	"_Color": "Color",
	"_ShadeToony": "Lighting",
	"_ShadeShift": "Advanced Lighting Settings",
	"_EmissionColor": "Emission",
	"_RimColor": "Rim Light",
	"_OutlineWidthMode": "Outline",
	"_OutlineColorMode": "Outline Color",
	"_MainTex_ST": "UV Coordinates",
	"_UvAnimMaskTexture": "Auto Animation",
	"_DebugMode": "Debugging Options",
}

const property_text: Dictionary = {
	"_AlphaCutoutEnable": ["Rendering Type", "TransparentWithZWrite mode can cause problems with rendering."],
	"_Color": ["Lit Color, Alpha", "Lit (RGB), Alpha (A)"],
	"_ShadeColor": ["Shade Color", "Shade (RGB)"],
	"_Cutoff": ["Alpha Cutoff", "Discard pixels below this value in Cutout mode"],
	"_MatcapColor": ["MatCap Color", "Color multiplied with Additive Sphere map / MatCap Texture (RGB)"],
	"_ShadeToony": ["Shading Toony", "0.0 is Lambert. Higher value get toony shading."],
	"_BumpScale": ["Normal Map", "Normal Map and Multiplier for normals in tangent space"],
	"_ShadeShift": ["Shading Shift", "Zero is Default. Negative value increase lit area. Positive value increase shade area."],
	"_ReceiveShadowRate": ["Shadow Receive", "Texture (R) * Rate. White is Default. Black attenuates shadows."],
	"_ShadingGradeRate": ["Shading Grade", "Lit & Shade Mixing Multiplier: Texture (R) * Rate. Compatible with UTS2 ShadingGradeMap. White is Default. Black amplifies shade."],
	"_LightColorAttenuation": ["Light Color Atten", "Light Color Attenuation"],
	"_IndirectLightIntensity": ["GI Intensity", "Indirect Light Intensity"],
	"_EmissionColor": ["Emission", "Emission Color (RGB)"],
	"_RimColor": ["Rim Color", "Rim Color (RGB)"],
	"_RimLightingMix": ["Lighting Mix", "Rim Lighting Mix"],
	"_RimFresnelPower": ["Fresnel Power", "If you increase this value, you get sharper rim light."],
	"_RimLift": ["Rim Lift", "If you increase this value, you can lift rim light."],
	"_OutlineWidthMode": ["Mode", "None = outline pass disabled; World = outline in world coordinates; Screen = screen pixel thickness"],
	"_OutlineWidth": ["Width", "Outline Width"],
	"_OutlineScaledMaxDistance": ["Outline Scaled Dist", "Width Scaled Max Distance"],
	"_OutlineColorMode": ["Color Mode", "FixedColor = unshaded; MixedLighting = match environment light (recommended)"],
	"_OutlineColor": ["Outline Color", "Outline Color (RGB)"],
	"_OutlineLightingMix": ["Outline Mix", "Outline Lighting Mix"],
	"_MainTex_ST": ["Offset", "UV Scale (X,Y), UV Offset (X,Y)"],
	"_UvAnimMaskTexture": ["UV Anim Mask", "Auto Animation Mask Texture (R)", false],
	"_UvAnimScrollX": ["UV Scroll X", "Scroll X (per second)"],
	"_UvAnimScrollY": ["UV Scroll Y", "Scroll Y (per second)"],
	"_UvAnimRotation": ["UV Rotation", "Rotation value (per second)"],
	"_DebugMode": ["Visualize", "Debugging Visualization: Normal or Lighting"],
}

const single_line_properties = {
	"_MainTex": "_Color",
	"_ShadeTexture": "_ShadeColor",
	"_BumpMap": "_BumpScale",
	"_ReceiveShadowTexture": "_ReceiveShadowRate",
	"_ShadingGradeTexture": "_ShadingGradeRate",
	"_RimTexture": "_RimColor",
	"_EmissionMap": "_EmissionColor",
	"_OutlineWidthTexture": "_OutlineWidth",
	"_SphereAdd": "_MatcapColor",
}

const single_line_after_properties = {
	# "_SphereAdd": "_EmissionColor",
	"_UvAnimMaskTexture": "_MainTex_ST",
}

const mins = {
	"_ShadeShift": -1.0,
	"_OutlineWidth": 0.01,
	"_OutlineScaledMaxDistance": 1.0,
	"_UvAnimScrollX": -100.0,
	"_UvAnimScrollY": -100.0,
	"_UvAnimRotation": -100.0,
}

const maxes = {
	"_RimFresnelPower": 100.0,
	"_OutlineScaledMaxDistance": 10.0,
	"_UvAnimScrollX": 100.0,
	"_UvAnimScrollY": 100.0,
	"_UvAnimRotation": 100.0,
}

const steps = {
	"_RimFresnelPower": -0.001,
	"_BumpScale": 0.0,
	"_UvAnimScrollX": 0.0,
	"_UvAnimScrollY": 0.0,
	"_UvAnimRotation": 0.0,
	"_OutlineWidth": 0.0,
	"_OutlineScaledMaxDistance": 0.0,
}


func merge_single_line_properties(label: String, outer_prop: Control, inner_prop: Control) -> void:
	var parent_vbox: Control = outer_prop.get_parent()
	parent_vbox.remove_child(inner_prop)
	inner_prop.label = ""
	outer_prop.label = label
	var sub_picker: Control = outer_prop.get_child(outer_prop.get_child_count() - 1)
	outer_prop.remove_child(sub_picker)
	sub_picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sub_picker.size_flags_vertical = 0

	var new_hbox: HBoxContainer = HBoxContainer.new()
	new_hbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
	new_hbox.add_child(sub_picker, true)

	var new_control: Control = Control.new()
	new_control.mouse_filter = Control.MOUSE_FILTER_IGNORE
	new_control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	new_hbox.add_child(new_control, true)
	# Is it a bad idea to constrain the inspector like this?
	new_hbox.custom_minimum_size = Vector2(155, 20)
	outer_prop.custom_minimum_size = Vector2(190, 20)
	outer_prop.add_child(inner_prop, true)
	outer_prop.add_child(new_hbox, true)


# Copy texture modifications to next_pass material
func _texture_property_changed(texture_property: EditorProperty, object: ShaderMaterial, property_name: StringName, value: Variant) -> void:
	if MToonProperty.has_outline_pass_static(object):
		object.next_pass[texture_property.get_edited_property()] = value


func _process_tex_property(object: ShaderMaterial) -> void:
	var prop = last_tex_property
	var parent_vbox = first_property.get_parent()
	var texture_property: EditorProperty = parent_vbox.get_child(parent_vbox.get_child_count() - 1)
	texture_property.property_changed.connect(self._texture_property_changed.bind(texture_property, object))
	if single_line_properties.has(prop):
		var color_property: EditorProperty = property_name_to_editor.get(single_line_properties[prop])
		if color_property != null:
			merge_single_line_properties(color_property.label, color_property, texture_property)
	elif single_line_after_properties.has(prop):
		var new_parent: Node = property_name_to_editor.get(single_line_after_properties[prop])
		if new_parent != null:
			parent_vbox.remove_child(texture_property)
			new_parent.add_sibling(texture_property)
			texture_property.label = property_text.get(prop, ["texture_property.label", ""])[0]
			property_name_to_editor[prop] = texture_property


func do_unfold_section(editor_inspector_section: Node) -> void:
	editor_inspector_section.unfold()


#func parse_category(object_: Object, category: String) -> void:
#	print("Category " + str(category))


func _parse_end(object_: Object) -> void:
	var object: ShaderMaterial = object_
	if not last_tex_property.is_empty():
		_process_tex_property(object)
		last_tex_property = ""
	if first_property != null:
		var parent_vbox: Control = first_property.get_parent()
		do_unfold_section(parent_vbox.get_parent())
		for prop in property_name_to_editor:
			property_name_to_editor[prop].set_tooltip_text("shader_parameter/" + prop + "\n" + property_text.get(prop, ["", ""])[1])
		for param in property_headers:
			var property_editor: Control = property_name_to_editor.get(param)
			if property_editor != null:
				var scale_label: Label = Label.new()
				scale_label.text = " "
				var label: Label = Label.new()
				label.text = property_headers[param]
				var pos = parent_vbox.get_children().find(property_editor)
				if param.ends_with("_ST"):
					pos -= 1
				var hbox_container: Container = HBoxContainer.new()
				var label_container: Container = Container.new()
				label_container.add_child(label, true)
				hbox_container.add_child(label_container, true)
				hbox_container.add_child(scale_label, true)
				parent_vbox.add_child(hbox_container, true)
				parent_vbox.move_child(hbox_container, pos)
				label_container.size_flags_horizontal = Control.SIZE_FILL
				label_container.size_flags_vertical = Control.SIZE_FILL
				label.scale = Vector2(1.15, 1.05)
				label.offset_left = -10
				label.offset_top = 1
				var c: Color = label.get_theme_color("font_color")
				label.add_theme_color_override("font_color", Color(round(c.r), round(c.g), round(c.b), 1.0))
				property_name_to_editor[label.text] = hbox_container
		property_name_to_editor["_OutlineWidthMode"].hide_if_value = {
			0:
			[
				property_name_to_editor["_OutlineColorMode"],
				property_name_to_editor["_OutlineColor"],
				property_name_to_editor["_OutlineLightingMix"],
				property_name_to_editor["_OutlineWidth"],
				property_name_to_editor["_OutlineScaledMaxDistance"],
				property_name_to_editor["Outline Color"],
			],
			1:
			[
				property_name_to_editor["_OutlineScaledMaxDistance"],
			],
			2: [],
		}
		property_name_to_editor["_OutlineWidthMode"]._update_property()
		property_name_to_editor["_AlphaCutoutEnable"].hide_if_value = {
			0:
			[
				property_name_to_editor["_Cutoff"],
			],
			1: [],
		}
		property_name_to_editor["_AlphaCutoutEnable"]._update_property()
		first_property = null
		property_name_to_editor = {}.duplicate()


func is_a_shader_parameter(path: String) -> bool:
	return path.begins_with("shader_parameter/")


func _parse_property(object_: Object, type, path: String, hint, hint_text: String, usage, wide: bool) -> bool:
	var object: ShaderMaterial = object_
	if not last_tex_property.is_empty():
		_process_tex_property(object)
		last_tex_property = ""
	if path == "shader_parameter/_AlphaCutoutEnable":
		for param in property_text:
			if len(property_text[param]) == 3:
				continue
			var this_type: int = typeof(object.get_shader_parameter(param))
			var property_editor: EditorProperty = null
			var tooltip: String = property_text[param][1]
			if param == "_AlphaCutoutEnable":
				first_property = RenderingTypeInspector.new(tooltip)
				property_editor = first_property
			elif param == "_OutlineWidthMode":
				property_editor = OutlineModeInspector.new(tooltip)
			elif param == "_OutlineColorMode":
				property_editor = OutlineColorModeInspector.new(tooltip)
			elif param == "_DebugMode":
				property_editor = DebugModeInspector.new(tooltip)
			elif color_properties.has(param):
				property_editor = LinearColorInspector.new(tooltip, param == "_Color")
			elif param == "_MToonVersion":
				return true
			elif param.ends_with("_ST"):
				var reserve: ReserveInspector = ReserveInspector.new(tooltip)
				add_property_editor_for_multiple_properties("Scale", PackedStringArray(["nothing_to_see_here"]), reserve)
				property_editor = ScaleOffsetInspector.new(tooltip, reserve)
			else:
				property_editor = SpinInspector.new(tooltip, mins.get(param, 0.0), maxes.get(param, 1.0), steps.get(param, 0.001))
			property_editor.edited_object = object
			property_name_to_editor[param] = property_editor
			var path_arr = PackedStringArray(["shader_parameter/" + param])
			add_property_editor_for_multiple_properties(property_text[param][0], path_arr, property_editor)
		return true
	elif is_a_shader_parameter(str(path)):
		var param: String = str(path).split("/")[-1]
		if type == TYPE_OBJECT and str(hint_text).find("Texture") != -1:
			last_tex_property = param
			return false
		elif property_text.has(param):
			return true
	elif str(path) == "next_pass":
		return true
	return false


class MToonProperty:
	extends EditorProperty
	var edited_object: ShaderMaterial = null

	func get_edited_object_hack() -> ShaderMaterial:
		return edited_object

	var updating: bool = false
	var tooltip: String = ""
	var hide_if_value: Dictionary = {}

	# Tooltips do not seem to be functional for Godot properties
	func _make_custom_tooltip(text: String) -> Object:
		var label: Label = Label.new()
		label.text = text + self.tooltip
		label.custom_minimum_size = Vector2(200, 30)
		return label

	func get_tooltip_text() -> String:
		if not tooltip.is_empty():
			return tooltip
		else:
			return str(get_edited_property())

	func has_outline_pass() -> bool:
		return has_outline_pass_static(get_edited_object_hack())

	static func has_outline_pass_static(edited_mat: Material) -> bool:
		var next_pass: Material = edited_mat.next_pass
		var shader_name: String = ""
		if next_pass != null:
			shader_name = next_pass.shader.resource_path.split("/")[-1]
		return shader_name.find("mtoon_outline") != -1

	func set_outline_prop(prop: String, val) -> void:
		if has_outline_pass():
			get_edited_object_hack().next_pass[prop] = val
		update_hidden_props(val)

	func update_hidden_props(val) -> void:
		if hide_if_value.has(val):
			for prop in hide_if_value[0]:
				prop.visible = true
			for prop in hide_if_value[val]:
				prop.visible = false

	func _setup_slider(slider: Range, name: String) -> void:
		slider.label = name
		slider.allow_lesser = true
		slider.allow_greater = true
		slider.step = 0.001
		slider.rounded = false
		slider.min_value = 0.0
		slider.max_value = 1.0
		slider.size_flags_horizontal = SIZE_EXPAND_FILL
		slider.custom_minimum_size = Vector2(50.0, 20.0)
		slider.value_changed.connect(self._value_changed)

	func emit_changed(prop: StringName, val: Variant, field: StringName = &"", changing: bool = false) -> void:
		get_edited_object_hack()[prop] = val


class RenderingTypeInspector:
	extends MToonProperty
	var dropdown: OptionButton = OptionButton.new()
	var cull_off_checkbox: CheckBox = CheckBox.new()
	var rendering_type_box: VBoxContainer = VBoxContainer.new()

	func _init(tooltip: String) -> void:
		self.tooltip = tooltip
		add_child(rendering_type_box, true)
		dropdown.add_item("Opaque")
		dropdown.add_item("Cutout")
		dropdown.add_item("Transparent")
		dropdown.add_item("Trans ZWrite")
		rendering_type_box.add_child(dropdown, true)
		add_focusable(dropdown)
		cull_off_checkbox.text = "Cull Disabled"
		cull_off_checkbox.toggled.connect(self._cull_toggled)
		rendering_type_box.add_child(cull_off_checkbox, true)
		add_focusable(cull_off_checkbox)
		dropdown.item_selected.connect(self._item_selected)

	func _cull_toggled(value: bool) -> void:
		if updating:
			return
		_update_shader(dropdown.selected, value)

	func _item_selected(option_idx: int) -> void:
		if updating:
			return
		_update_shader(option_idx, cull_off_checkbox.button_pressed)

	func _update_shader(option_idx: int, cull_off: bool) -> void:
		var shader_name: String = get_edited_object_hack().shader.resource_path.split("/")[-1]
		match option_idx:
			0:  # Opaque
				emit_changed(get_edited_property(), 0)
				set_outline_prop(get_edited_property(), 0)
				get_edited_object_hack().shader = mtoon_cull_off if cull_off else mtoon
			1:  # Cutout
				emit_changed(get_edited_property(), 1)
				set_outline_prop(get_edited_property(), 1)
				get_edited_object_hack().shader = mtoon_cull_off if cull_off else mtoon
			2:  # Transparent
				emit_changed(get_edited_property(), 0)
				set_outline_prop(get_edited_property(), 0)
				get_edited_object_hack().shader = mtoon_trans_cull_off if cull_off else mtoon_trans
			3:  # TransparentWithZWrite
				emit_changed(get_edited_property(), 0)
				set_outline_prop(get_edited_property(), 0)
				get_edited_object_hack().shader = mtoon_trans_zwrite_cull_off if cull_off else mtoon_trans_zwrite

	func _update_property() -> void:
		var val: Variant = get_edited_object_hack()[get_edited_property()]
		if typeof(val) == TYPE_NIL:
			val = 0.0
		updating = true
		var shader_name = get_edited_object_hack().shader.resource_path.split("/")[-1]
		var cull_off: bool = shader_name.find("_cull_off") != -1
		if shader_name.find("mtoon_trans_zwrite") != -1:
			val = 3
		elif shader_name.find("mtoon_trans") != -1:
			val = 2
		update_hidden_props(1 if val == 1 else 0)
		dropdown.selected = val
		cull_off_checkbox.button_pressed = cull_off
		updating = false


class OutlineModeInspector:
	extends MToonProperty
	var dropdown: OptionButton = OptionButton.new()

	func _init(tooltip: String) -> void:
		self.tooltip = tooltip
		dropdown.add_item("None")
		dropdown.add_item("WorldCoordinates")
		dropdown.add_item("ScreenCoordinates")
		add_child(dropdown, true)
		add_focusable(dropdown)
		dropdown.item_selected.connect(self._item_selected)

	func _item_selected(option_idx: int) -> void:
		if updating:
			return
		var next_pass: Material = get_edited_object_hack().next_pass
		var has_outline: bool = has_outline_pass()
		if option_idx == 0 and has_outline:
			emit_changed("next_pass", get_edited_object_hack().next_pass.next_pass)
		if option_idx != 0 and not has_outline:
			next_pass = get_edited_object_hack().duplicate()
			next_pass.shader = mtoon_outline
			next_pass.next_pass = get_edited_object_hack().next_pass
			emit_changed("next_pass", next_pass)
		emit_changed(get_edited_property(), option_idx)
		set_outline_prop(get_edited_property(), option_idx)

	func _update_property() -> void:
		var val: Variant = get_edited_object_hack()[get_edited_property()]
		if typeof(val) == TYPE_NIL:
			val = 0
		if has_outline_pass() and val == 0:
			val = 1
		updating = true
		dropdown.selected = val
		update_hidden_props(val)
		updating = false


class OutlineColorModeInspector:
	extends MToonProperty
	var dropdown: OptionButton = OptionButton.new()

	func _init(tooltip: String) -> void:
		self.tooltip = tooltip
		dropdown.add_item("FixedColor")
		dropdown.add_item("MixedLighting")
		add_child(dropdown, true)
		add_focusable(dropdown)
		dropdown.item_selected.connect(self._item_selected)

	func _item_selected(option_idx: int) -> void:
		if updating:
			return
		emit_changed(get_edited_property(), option_idx)
		set_outline_prop(get_edited_property(), option_idx)

	func _update_property() -> void:
		var val: Variant = get_edited_object_hack()[get_edited_property()]
		if typeof(val) == TYPE_NIL:
			val = 0
		updating = true
		dropdown.selected = val
		updating = false


class DebugModeInspector:
	extends MToonProperty
	var dropdown: OptionButton = OptionButton.new()

	func _init(tooltip: String) -> void:
		self.tooltip = tooltip
		dropdown.add_item("None")
		dropdown.add_item("Normal")
		dropdown.add_item("LitShadeRate")
		add_child(dropdown, true)
		add_focusable(dropdown)
		dropdown.item_selected.connect(self._item_selected)

	func _item_selected(option_idx: int) -> void:
		if updating:
			return
		emit_changed(get_edited_property(), option_idx)
		set_outline_prop(get_edited_property(), option_idx)

	func _update_property() -> void:
		var val: Variant = get_edited_object_hack()[get_edited_property()]
		if typeof(val) == TYPE_NIL:
			val = 0
		updating = true
		dropdown.selected = val
		updating = false


class ReserveInspector:
	extends MToonProperty
	var hbox: HBoxContainer = HBoxContainer.new()

	func _init(tooltip: String) -> void:
		self.tooltip = tooltip
		add_child(hbox, true)

	func _update_property() -> void:
		pass


class SpinInspector:
	extends MToonProperty
	var x_input: Range = EditorSpinSlider.new()

	func _init(tooltip: String, minval: float, maxval: float, step: float) -> void:
		self.tooltip = tooltip
		_setup_slider(x_input, "")
		x_input.min_value = minval
		x_input.max_value = maxval
		if step != 0.0:
			x_input.step = abs(step)
			x_input.allow_lesser = false
			x_input.allow_greater = false
		if step < 0:
			x_input.exp_edit = true
		add_child(x_input, true)
		add_focusable(x_input)

	func _value_changed(value: float) -> void:
		emit_changed(get_edited_property(), x_input.value)
		set_outline_prop(get_edited_property(), x_input.value)

	func _update_property() -> void:
		var this_value: Variant = get_edited_object_hack()[get_edited_property()]
		if typeof(this_value) == TYPE_NIL:
			const defaults = {
				"_Cutoff": 0.5,
				"_BumpScale": 1.0,
				"_ReceiveShadowRate": 1.0,
				"_ShadingGradeRate": 1.0,
				"_ShadeToony": 0.9,
				"_RimFresnelPower": 1.0,
				"_OutlineWidth": 0.5,
				"_OutlineScaledMaxDistance": 1.0,
				"_IndirectLightIntensity": 0.1,
			}
			this_value = defaults.get(str(get_edited_property()).split("/")[-1], 0.0)
		updating = true
		x_input.value = this_value
		updating = false


class ScaleOffsetInspector:
	extends MToonProperty
	var hbox: HBoxContainer = HBoxContainer.new()
	var x_input: Range = EditorSpinSlider.new()
	var y_input: Range = EditorSpinSlider.new()
	var z_input: Range = EditorSpinSlider.new()
	var w_input: Range = EditorSpinSlider.new()

	func _init(tooltip: String, reserve: ReserveInspector) -> void:
		self.tooltip = tooltip
		var hbox_scale = reserve.hbox
		_setup_slider(x_input, "x")
		_setup_slider(y_input, "y")
		hbox_scale.add_child(x_input, true)
		reserve.add_focusable(x_input)
		hbox_scale.add_child(y_input, true)
		reserve.add_focusable(y_input)
		add_child(hbox, true)
		_setup_slider(z_input, "z")
		_setup_slider(w_input, "w")
		hbox.add_child(z_input, true)
		add_focusable(z_input)
		hbox.add_child(w_input, true)
		add_focusable(w_input)

	func _value_changed(value: float) -> void:
		var new_val: Vector4 = Vector4(x_input.value, y_input.value, z_input.value, w_input.value)
		emit_changed(get_edited_property(), new_val)
		set_outline_prop(get_edited_property(), new_val)

	func _update_property() -> void:
		var st_value: Variant = get_edited_object_hack()[get_edited_property()]
		if typeof(st_value) == TYPE_NIL:
			st_value = Vector4(1, 1, 0, 0)
		updating = true
		x_input.value = st_value.x
		y_input.value = st_value.y
		z_input.value = st_value.z
		w_input.value = st_value.w
		updating = false


class LinearColorInspector:
	extends MToonProperty
	var color_picker: ColorPickerButton = ColorPickerButton.new()
	var color_picker2: ColorPickerButton = ColorPickerButton.new()
	var picker_box: HBoxContainer = HBoxContainer.new()

	func _init(tooltip: String, allow_alpha: bool) -> void:
		self.tooltip = tooltip
		add_child(color_picker)  # picker_box)
		#picker_box.add_child(color_picker, true)
		add_focusable(color_picker)
		#picker_box.add_child(color_picker2, true)
		#add_focusable(color_picker2)
		color_picker.edit_alpha = allow_alpha
		color_picker.custom_minimum_size = Vector2(40.0, 40.0)
		#color_picker2.custom_minimum_size = Vector2(40.0, 40.0)
		color_picker.color_changed.connect(self._color_changed)

	func _color_changed(new_color: Color) -> void:
		if updating:
			return
		var new_val: Color = Color(new_color.r, new_color.g, new_color.b, new_color.a)
		emit_changed(get_edited_property(), new_val)
		set_outline_prop(get_edited_property(), new_val)

	func _update_property() -> void:
		var linear_color: Variant = get_edited_object_hack()[get_edited_property()]
		if typeof(linear_color) == TYPE_NIL:
			const defaults = {
				"_Color": Color(1.0, 1.0, 1.0, 1.0),
				"_ShadeColor": Color(0.97, 0.81, 0.86, 1.0),
			}
			linear_color = defaults.get(str(get_edited_property()).split("/")[-1], Color(0, 0, 0, 1))
		updating = true
		color_picker.color = linear_color
		updating = false
