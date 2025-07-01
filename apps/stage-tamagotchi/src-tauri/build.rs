fn main() {
  tauri_build::try_build(
    tauri_build::Attributes::new()
      .plugin(
        "proj-airi-tauri-plugin-audio-transcription",
        tauri_build::InlinedPlugin::new()
          .commands(&["load_model_whisper", "audio_transcription"])
          .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
      )
      .plugin(
        "proj-airi-tauri-plugin-audio-vad",
        tauri_build::InlinedPlugin::new()
          .commands(&["load_model_silero_vad", "audio_vad"])
          .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
      )
      .plugin(
        "proj-airi-tauri-plugin-window",
        tauri_build::InlinedPlugin::new()
          .commands(&[
            "get_display_info",
            "get_current_window_info",
            "set_position",
          ])
          .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
      )
      .plugin(
        "proj-airi-tauri-plugin-window-pass-through-on-hover",
        tauri_build::InlinedPlugin::new()
          .commands(&[
            "start_monitor",
            "stop_monitor",
            "start_pass_through",
            "stop_pass_through",
          ])
          .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
      )
      .plugin(
        "proj-airi-tauri-plugin-window-router-link",
        tauri_build::InlinedPlugin::new()
          .commands(&["go"])
          .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
      )
      .plugin(
        "proj-airi-tauri-plugin-window-persistence",
        tauri_build::InlinedPlugin::new()
          .commands(&["save", "restore"])
          .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
      ),
  )
  .expect("Failed to build Tauri application");
}
