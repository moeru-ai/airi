const COMMANDS: &[&str] = &["load_ort_model_whisper", "ipc_audio_transcription"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS).build();
}
