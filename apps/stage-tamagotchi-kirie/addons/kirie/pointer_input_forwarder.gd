extends RefCounted

# Replays pointer control records from a Kirie WebView as Godot InputEvents.
# ASCII "KIRI". A stable non-hardware ID lets consumers distinguish forwarded
# events from physical input instead of reporting them as Godot's default device 0.
# InputEvent.device:
# https://docs.godotengine.org/en/stable/classes/class_inputevent.html
var _last_positions: Dictionary = {}
var _active_pointers: Dictionary = {}

func reset(cef_control: Control = null) -> void:
	var active_pointers = self._active_pointers.duplicate(true)
	self._last_positions.clear()
	self._active_pointers.clear()
	for pointer_id in active_pointers.keys():
		var state = active_pointers.get(pointer_id)
		var position = state.get("position")
		var event: InputEvent
		if state.get("pointer_type") == "mouse":
			var button_index = self._mouse_button_index(state.get("button"))
			if button_index == MouseButton.MOUSE_BUTTON_NONE:
				continue
			var button = InputEventMouseButton.new()
			button.device = self.FORWARDED_POINTER_DEVICE_ID
			button.position = position
			button.set("global_position", position)
			button.button_index = button_index
			button.pressed = false
			button.canceled = true
			event = button
		else:
			var touch = InputEventScreenTouch.new()
			touch.device = self.FORWARDED_POINTER_DEVICE_ID
			touch.index = pointer_id
			touch.position = position
			touch.pressed = false
			touch.canceled = true
			event = touch
		self._set_event_window(event, cef_control)
		self._dispatch_event(event, cef_control)

func try_forward_pointer_input(value, enabled: bool, cef_control: Control = null) -> bool:
	if not (value is Dictionary):
		return false
	if not value.has(self.PACKET_KEY):
		return false
	var input_candidate = value.get(self.PACKET_KEY)
	if not (input_candidate is Dictionary):
		push_warning("Ignored malformed Kirie input control record")
		return true
	if "" + str(input_candidate.get("kind", "")) != "pointer":
		push_warning("Ignored unsupported Kirie input control record")
		return true
	if not enabled:
		return true
	var event = self._create_event(input_candidate, cef_control)
	if event == null:
		return true
	self._dispatch_event(event, cef_control)
	return true

func _create_event(input: Dictionary, cef_control: Control) -> InputEvent:
	var normalized_x = input.get("normalized_x", NAN)
	var normalized_y = input.get("normalized_y", NAN)
	var pointer_id_value = input.get("pointer_id", 0)
	var button_value = input.get("button", -1)
	var buttons_value = input.get("buttons", 0)
	var pointer_type = "" + str(input.get("pointer_type", ""))
	var pressure_value = input.get("pressure", 0.0 if pointer_type == "mouse" else 1.0)
	if not self._is_number(normalized_x) or not self._is_number(normalized_y) or not self._is_number(pointer_id_value) or not self._is_number(button_value) or not self._is_number(buttons_value) or not self._is_number(pressure_value):
		push_warning("Ignored Kirie input packet with invalid numeric fields")
		return null
	var normalized_position = Vector2(float(normalized_x), float(normalized_y))
	if not is_finite(normalized_position.x) or not is_finite(normalized_position.y):
		push_warning("Ignored Kirie input packet with invalid coordinates")
		return null
	normalized_position = normalized_position.clamp(Vector2.ZERO, Vector2.ONE)
	var position = self._resolve_window_position(normalized_position, cef_control)
	var pointer_id = int(pointer_id_value)
	var phase = "" + str(input.get("phase", ""))
	if phase != "down" and phase != "move" and phase != "up" and phase != "cancel":
		push_warning("Ignored Kirie input packet with unknown phase: " + str(phase))
		return null
	var previous_position = self._last_positions.get(pointer_id, position)
	var event: InputEvent
	if pointer_type == "touch" or pointer_type == "pen":
		event = self._create_touch_event(phase, pointer_id, position, previous_position, pressure_value)
	elif pointer_type == "mouse":
		event = self._create_mouse_event(phase, pointer_id, position, previous_position, int(button_value), int(buttons_value), pressure_value)
	else:
		push_warning("Ignored Kirie input packet with unknown pointer type: " + str(pointer_type))
		return null
	if event == null:
		return null
	if phase == "down" or phase == "move":
		self._last_positions[pointer_id] = position
	else:
		self._last_positions.erase(pointer_id)
	if phase == "down":
		self._active_pointers.set(pointer_id, {
			"pointer_type": pointer_type,
			"button": int(button_value),
			"position": position,
		})
	elif phase == "move" and self._active_pointers.has(pointer_id):
		var state = self._active_pointers.get(pointer_id)
		state.position = position
	elif phase == "up" or phase == "cancel":
		self._active_pointers.erase(pointer_id)
	self._set_event_window(event, cef_control)
	return event

func _create_touch_event(phase, pointer_id: int, position: Vector2, previous_position: Vector2, pressure: float) -> InputEvent:
	if phase == "move":
		var drag = InputEventScreenDrag.new()
		drag.device = self.FORWARDED_POINTER_DEVICE_ID
		drag.index = pointer_id
		drag.position = position
		drag.relative = (position - previous_position)
		drag.screen_relative = drag.relative
		drag.pressure = clampf(float(pressure), 0.0, 1.0)
		return drag
	var touch = InputEventScreenTouch.new()
	touch.device = self.FORWARDED_POINTER_DEVICE_ID
	touch.index = pointer_id
	touch.position = position
	touch.pressed = phase == "down"
	touch.canceled = phase == "cancel"
	return touch

func _create_mouse_event(phase, pointer_id: int, position: Vector2, previous_position: Vector2, dom_button: int, dom_buttons: int, pressure: float) -> InputEvent:
	if phase == "move":
		var motion = InputEventMouseMotion.new()
		motion.device = self.FORWARDED_POINTER_DEVICE_ID
		motion.position = position
		motion.set("global_position", position)
		motion.relative = (position - previous_position)
		motion.screen_relative = motion.relative
		motion.button_mask = self._mouse_button_mask(dom_buttons)
		motion.pressure = clampf(float(pressure), 0.0, 1.0)
		return motion
	var button_index = self._mouse_button_index(dom_button)
	if button_index == MouseButton.MOUSE_BUTTON_NONE and phase == "cancel":
		if self._active_pointers.has(pointer_id):
			var state = self._active_pointers.get(pointer_id)
			button_index = self._mouse_button_index(state.get("button"))
	if button_index == MouseButton.MOUSE_BUTTON_NONE:
		push_warning("Ignored Kirie input packet with unknown mouse button")
		return null
	var button = InputEventMouseButton.new()
	button.device = self.FORWARDED_POINTER_DEVICE_ID
	button.position = position
	button.set("global_position", position)
	button.button_index = button_index
	button.button_mask = 0 if phase == "cancel" else self._mouse_button_mask(dom_buttons)
	button.pressed = phase == "down"
	button.canceled = phase == "cancel"
	return button

func _resolve_window_position(normalized_position: Vector2, cef_control: Control) -> Vector2:
	if cef_control == null:
		return (normalized_position * Vector2(DisplayServer.window_get_size()))
	var local_position = (normalized_position * cef_control.size)
	var viewport_position = (cef_control.get_global_transform_with_canvas() * local_position)
	return (cef_control.get_viewport().get_final_transform() * viewport_position)

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
	var was_processing_input = cef_control.is_processing_input()
	var previous_mouse_filter = cef_control.mouse_filter
	cef_control.set_process_input(false)
	cef_control.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Input.parse_input_event(event)
	Input.flush_buffered_events()
	cef_control.mouse_filter = previous_mouse_filter
	cef_control.set_process_input(was_processing_input)

func _set_event_window(event: InputEvent, cef_control: Control) -> void:
	if cef_control == null:
		return
	if not (event is InputEventFromWindow):
		return
	var window = cef_control.get_window()
	if window == null:
		return
	event.window_id = window.get_window_id()

func _mouse_button_mask(dom_buttons: int) -> MouseButtonMask:
	var mask: int = 0
	if (dom_buttons & 1) != 0:
		mask = mask | MouseButtonMask.MOUSE_BUTTON_MASK_LEFT
	if (dom_buttons & 2) != 0:
		mask = mask | MouseButtonMask.MOUSE_BUTTON_MASK_RIGHT
	if (dom_buttons & 4) != 0:
		mask = mask | MouseButtonMask.MOUSE_BUTTON_MASK_MIDDLE
	if (dom_buttons & 8) != 0:
		mask = mask | MouseButtonMask.MOUSE_BUTTON_MASK_MB_XBUTTON1
	if (dom_buttons & 16) != 0:
		mask = mask | MouseButtonMask.MOUSE_BUTTON_MASK_MB_XBUTTON2
	return mask

func _is_number(value):
	return value is int or value is float

func _mouse_button_index(dom_button: int) -> MouseButton:
	match dom_button:
		0:
			return MouseButton.MOUSE_BUTTON_LEFT
		1:
			return MouseButton.MOUSE_BUTTON_MIDDLE
		2:
			return MouseButton.MOUSE_BUTTON_RIGHT
		3:
			return MouseButton.MOUSE_BUTTON_XBUTTON1
		4:
			return MouseButton.MOUSE_BUTTON_XBUTTON2
		_:
			return MouseButton.MOUSE_BUTTON_NONE

const PACKET_KEY = "__gd_kirie_control"

const FORWARDED_POINTER_DEVICE_ID = 0x4B495249
