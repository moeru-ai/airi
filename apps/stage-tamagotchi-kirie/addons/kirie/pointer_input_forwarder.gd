extends RefCounted

# Replays pointer control records from a Kirie WebView as Godot InputEvents.
const PACKET_KEY := "__gd_kirie_control"

# ASCII "KIRI". A stable non-hardware ID lets consumers distinguish forwarded
# events from physical input instead of reporting them as Godot's default device 0.
# InputEvent.device:
# https://docs.godotengine.org/en/stable/classes/class_inputevent.html
const FORWARDED_POINTER_DEVICE_ID := 0x4B495249

var _last_positions: Dictionary[int, Vector2] = {}
var _active_pointers: Dictionary[int, Dictionary] = {}


func reset(cef_control: Control = null) -> void:
	var active_pointers := _active_pointers.duplicate(true)
	_last_positions.clear()
	_active_pointers.clear()

	for pointer_id: int in active_pointers:
		var state := active_pointers[pointer_id] as Dictionary
		var position: Vector2 = state["position"]
		var event: InputEvent
		if state["pointer_type"] == "mouse":
			var button_index := _mouse_button_index(int(state["button"]))
			if button_index == MOUSE_BUTTON_NONE:
				continue

			var button := InputEventMouseButton.new()
			button.device = FORWARDED_POINTER_DEVICE_ID
			button.position = position
			button.global_position = position
			button.button_index = button_index
			button.pressed = false
			button.canceled = true
			event = button
		else:
			var touch := InputEventScreenTouch.new()
			touch.device = FORWARDED_POINTER_DEVICE_ID
			touch.index = pointer_id
			touch.position = position
			touch.pressed = false
			touch.canceled = true
			event = touch

		_set_event_window(event, cef_control)
		_dispatch_event(event, cef_control)


func try_forward_pointer_input(
	value: Variant,
	enabled: bool,
	cef_control: Control = null,
) -> bool:
	if typeof(value) != TYPE_DICTIONARY or not value.has(PACKET_KEY):
		return false

	var input_candidate: Variant = value[PACKET_KEY]
	if typeof(input_candidate) != TYPE_DICTIONARY:
		push_warning("Ignored malformed Kirie input control record")
		return true

	var input := input_candidate as Dictionary
	if str(input.get("kind", "")) != "pointer":
		push_warning("Ignored unsupported Kirie input control record")
		return true

	if not enabled:
		return true

	var event := _create_event(input, cef_control)
	if event == null:
		return true

	_dispatch_event(event, cef_control)
	return true


func _create_event(input: Dictionary, cef_control: Control) -> InputEvent:
	var normalized_position := Vector2(
		float(input.get("normalized_x", NAN)),
		float(input.get("normalized_y", NAN))
	)
	if not is_finite(normalized_position.x) or not is_finite(normalized_position.y):
		push_warning("Ignored Kirie input packet with invalid coordinates")
		return null

	normalized_position = normalized_position.clamp(Vector2.ZERO, Vector2.ONE)
	var position := _resolve_window_position(normalized_position, cef_control)
	var pointer_id := int(input.get("pointer_id", 0))
	var pointer_type := str(input.get("pointer_type", ""))
	var phase := str(input.get("phase", ""))
	var previous_position := _last_positions.get(pointer_id, position)

	if phase != "down" and phase != "move" and phase != "up" and phase != "cancel":
		push_warning("Ignored Kirie input packet with unknown phase: %s" % phase)
		return null

	var event: InputEvent
	if pointer_type == "touch" or pointer_type == "pen":
		event = _create_touch_event(input, phase, pointer_id, position, previous_position)
	elif pointer_type == "mouse":
		event = _create_mouse_event(input, phase, pointer_id, position, previous_position)
	else:
		push_warning("Ignored Kirie input packet with unknown pointer type: %s" % pointer_type)
		return null

	if event == null:
		return null

	if phase == "down" or phase == "move":
		_last_positions[pointer_id] = position
	else:
		_last_positions.erase(pointer_id)

	if phase == "down":
		_active_pointers[pointer_id] = {
			"pointer_type": pointer_type,
			"button": int(input.get("button", -1)),
			"position": position,
		}
	elif phase == "move" and _active_pointers.has(pointer_id):
		_active_pointers[pointer_id]["position"] = position
	elif phase == "up" or phase == "cancel":
		_active_pointers.erase(pointer_id)

	_set_event_window(event, cef_control)
	return event


func _create_touch_event(
	input: Dictionary,
	phase: String,
	pointer_id: int,
	position: Vector2,
	previous_position: Vector2,
) -> InputEvent:
	if phase == "move":
		var drag := InputEventScreenDrag.new()
		drag.device = FORWARDED_POINTER_DEVICE_ID
		drag.index = pointer_id
		drag.position = position
		drag.relative = position - previous_position
		drag.screen_relative = drag.relative
		drag.pressure = clampf(float(input.get("pressure", 1.0)), 0.0, 1.0)
		return drag

	var touch := InputEventScreenTouch.new()
	touch.device = FORWARDED_POINTER_DEVICE_ID
	touch.index = pointer_id
	touch.position = position
	touch.pressed = phase == "down"
	touch.canceled = phase == "cancel"
	return touch


func _create_mouse_event(
	input: Dictionary,
	phase: String,
	pointer_id: int,
	position: Vector2,
	previous_position: Vector2,
) -> InputEvent:
	if phase == "move":
		var motion := InputEventMouseMotion.new()
		motion.device = FORWARDED_POINTER_DEVICE_ID
		motion.position = position
		motion.global_position = position
		motion.relative = position - previous_position
		motion.screen_relative = motion.relative
		motion.button_mask = _mouse_button_mask(int(input.get("buttons", 0)))
		motion.pressure = clampf(float(input.get("pressure", 0.0)), 0.0, 1.0)
		return motion

	var button_index := _mouse_button_index(int(input.get("button", -1)))
	if button_index == MOUSE_BUTTON_NONE and phase == "cancel":
		var state: Dictionary = _active_pointers.get(pointer_id, {})
		button_index = _mouse_button_index(int(state.get("button", -1)))
	if button_index == MOUSE_BUTTON_NONE:
		push_warning("Ignored Kirie input packet with unknown mouse button")
		return null

	var button := InputEventMouseButton.new()
	button.device = FORWARDED_POINTER_DEVICE_ID
	button.position = position
	button.global_position = position
	button.button_index = button_index
	button.button_mask = (
		0 as MouseButtonMask
		if phase == "cancel"
		else _mouse_button_mask(int(input.get("buttons", 0)))
	)
	button.pressed = phase == "down"
	button.canceled = phase == "cancel"
	return button


func _resolve_window_position(normalized_position: Vector2, cef_control: Control) -> Vector2:
	if cef_control == null:
		return normalized_position * Vector2(DisplayServer.window_get_size())

	var local_position := normalized_position * cef_control.size
	var viewport_position := cef_control.get_global_transform_with_canvas() * local_position
	return cef_control.get_viewport().get_final_transform() * viewport_position


func _dispatch_event(event: InputEvent, cef_control: Control) -> void:
	if cef_control == null:
		Input.parse_input_event(event)
		return

	# parse_input_event() injects the forwarded event into Godot's normal input
	# pipeline. Godot CEF receives that pipeline in CefTexture.input() and sends
	# pointer events back to CEF. If its Control remains active, the event loops
	# WebView -> Godot -> WebView. Temporarily disable _input() to break the loop
	# and use MOUSE_FILTER_IGNORE so Godot Controls behind CEF receive the event.
	# Flush synchronously before restoring both settings.
	# Godot API:
	# https://docs.godotengine.org/en/stable/classes/class_input.html
	# Godot CEF: CefTexture.input() and handle_input_event().
	# https://github.com/dsh0416/godot-cef/blob/main/crates/gdcef/src/cef_texture/mod.rs
	var was_processing_input := cef_control.is_processing_input()
	var previous_mouse_filter := cef_control.mouse_filter
	cef_control.set_process_input(false)
	cef_control.mouse_filter = Control.MOUSE_FILTER_IGNORE

	Input.parse_input_event(event)
	Input.flush_buffered_events()

	cef_control.mouse_filter = previous_mouse_filter
	cef_control.set_process_input(was_processing_input)


func _set_event_window(event: InputEvent, cef_control: Control) -> void:
	if cef_control != null:
		(event as InputEventFromWindow).window_id = cef_control.get_window().get_window_id()


func _mouse_button_mask(dom_buttons: int) -> MouseButtonMask:
	var mask := 0 as MouseButtonMask
	if (dom_buttons & 1) != 0:
		mask |= MOUSE_BUTTON_MASK_LEFT
	if (dom_buttons & 2) != 0:
		mask |= MOUSE_BUTTON_MASK_RIGHT
	if (dom_buttons & 4) != 0:
		mask |= MOUSE_BUTTON_MASK_MIDDLE
	if (dom_buttons & 8) != 0:
		mask |= MOUSE_BUTTON_MASK_MB_XBUTTON1
	if (dom_buttons & 16) != 0:
		mask |= MOUSE_BUTTON_MASK_MB_XBUTTON2
	return mask


func _mouse_button_index(dom_button: int) -> MouseButton:
	match dom_button:
		0:
			return MOUSE_BUTTON_LEFT
		1:
			return MOUSE_BUTTON_MIDDLE
		2:
			return MOUSE_BUTTON_RIGHT
		3:
			return MOUSE_BUTTON_XBUTTON1
		4:
			return MOUSE_BUTTON_XBUTTON2
		_:
			return MOUSE_BUTTON_NONE
