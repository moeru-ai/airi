/**
 * The services a caller may ask Home Assistant to run.
 *
 * The access policy names devices, and a device check is only as good as the
 * service that acts on it. Two kinds of service break the link between the
 * device a caller checked and what the call changes:
 *
 * - A service that is its own target. A script registers a service named after
 *   it, so `POST /api/services/script/good_night` runs that script and ignores
 *   the `entity_id` in the body. Measured on a test instance: the script ran
 *   while the body named an unrelated switch.
 * - A service that expands its target. `light.turn_on` on a group entity turns
 *   on every member. Measured: a group with two members changed both.
 *
 * A list cannot describe every service in an installation, so this one holds the
 * services that act on the device the caller named. A service outside the list
 * fails, and the message names what the domain does accept.
 */
const allowedServices: Record<string, string[]> = {
  button: ['press'],
  climate: ['set_fan_mode', 'set_humidity', 'set_hvac_mode', 'set_preset_mode', 'set_swing_horizontal_mode', 'set_swing_mode', 'set_temperature', 'toggle', 'turn_off', 'turn_on'],
  cover: ['close_cover', 'close_cover_tilt', 'open_cover', 'open_cover_tilt', 'set_cover_position', 'set_cover_tilt_position', 'stop_cover', 'stop_cover_tilt', 'toggle', 'toggle_cover_tilt'],
  fan: ['decrease_speed', 'increase_speed', 'oscillate', 'set_direction', 'set_percentage', 'set_preset_mode', 'toggle', 'turn_off', 'turn_on'],
  // The generic actuators of Home Assistant act on the named entity, so they
  // stay available. Every other service in this domain changes the system.
  homeassistant: ['toggle', 'turn_off', 'turn_on'],
  humidifier: ['set_humidity', 'set_mode', 'toggle', 'turn_off', 'turn_on'],
  input_boolean: ['toggle', 'turn_off', 'turn_on'],
  input_number: ['decrement', 'increment', 'set_value'],
  input_select: ['select_next', 'select_option', 'select_previous'],
  input_text: ['set_value'],
  light: ['toggle', 'turn_off', 'turn_on'],
  lock: ['lock', 'open', 'unlock'],
  media_player: ['clear_playlist', 'media_next_track', 'media_pause', 'media_play', 'media_play_pause', 'media_previous_track', 'media_seek', 'media_stop', 'play_media', 'repeat_set', 'select_sound_mode', 'select_source', 'shuffle_set', 'toggle', 'turn_off', 'turn_on', 'volume_down', 'volume_mute', 'volume_set', 'volume_up'],
  number: ['set_value'],
  // A scene is a device the user allows or blocks, and its effect is what the
  // user allowed with it.
  scene: ['turn_on'],
  // Only the services that take an entity id. A script named as the service is
  // not here, because that service is its own target.
  script: ['toggle', 'turn_off', 'turn_on'],
  select: ['select_first', 'select_last', 'select_next', 'select_option', 'select_previous'],
  siren: ['toggle', 'turn_off', 'turn_on'],
  switch: ['toggle', 'turn_off', 'turn_on'],
  text: ['set_value'],
  vacuum: ['clean_area', 'clean_spot', 'locate', 'pause', 'return_to_base', 'set_fan_speed', 'start', 'stop'],
  valve: ['close_valve', 'open_valve', 'set_valve_position', 'stop_valve', 'toggle'],
  water_heater: ['set_operation_mode', 'set_temperature', 'turn_off', 'turn_on'],
}

/** One attribute Home Assistant adds to an entity that stands for several others. */
const memberAttribute = 'entity_id'

/**
 * Rejects a service that is not one this integration runs.
 *
 * The model reads the message, so it names what the domain accepts.
 */
export function assertServiceAllowed(domain: string, service: string): void {
  const allowed = allowedServices[domain]
  if (!allowed) {
    throw new Error(`Home Assistant service domain "${domain}" is not one this integration runs. Use the service of the device domain, for example light.turn_on for a light, or homeassistant.turn_on for any device.`)
  }

  if (!allowed.includes(service)) {
    const list = allowed.join(', ')
    throw new Error(`Home Assistant service "${domain}.${service}" is not one this integration runs. The "${domain}" domain accepts: ${list}.`)
  }
}

/**
 * Reports whether an entity stands for a group of other entities.
 *
 * A group carries the members in its own attributes. A service call on the
 * group reaches every member, so a caller that checked one device would change
 * devices it never saw.
 */
export function isGroupEntity(attributes: Record<string, unknown>): boolean {
  const members = attributes[memberAttribute]
  return Array.isArray(members) && members.length > 0
}
