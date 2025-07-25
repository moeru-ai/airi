const COMMANDS: &[&str] = &["load_ort_model_silero_vad", "ipc_audio_vad"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS).build();
}
