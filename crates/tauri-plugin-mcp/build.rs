const COMMANDS: &[&str] = &[
  "connect_server",
  "disconnect_server",
  "list_tools",
  "call_tool",
];

fn main() {
  tauri_plugin::Builder::new(COMMANDS).build();
}
