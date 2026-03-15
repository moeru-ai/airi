const COMMANDS: &[&str] = &["go"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS).build();
}
