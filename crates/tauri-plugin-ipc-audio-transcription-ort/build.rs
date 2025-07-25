const COMMANDS: &[&str] = &["load_candle_model_whisper", "ipc_audio_transcription"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS).build();
}
