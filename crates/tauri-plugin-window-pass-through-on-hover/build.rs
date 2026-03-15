const COMMANDS: &[&str] = &[
  "start_tracing_cursor",
  "stop_tracing_cursor",
  "start_pass_through",
  "stop_pass_through",
];

fn main() {
  tauri_plugin::Builder::new(COMMANDS).build();
}
