// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::Result;
use rmcp::{model::CallToolRequestParam, service::{RunningService, ServiceExt}, transport::TokioChildProcess, RoleClient};
use tokio::process::Command;

#[tokio::main]
async fn main() -> Result<()> {
  let service: RunningService<RoleClient, ()> = ().serve(TokioChildProcess::new(
    Command::new("docker").args(["run", "-i", "--rm", "-e", "ADB_HOST=host.docker.internal", "ghcr.io/lemonnekogh/airi-android:v0.1.0"])
  )?).await?;

  let server_info = service.peer_info();
  println!("Connected to server: {server_info:#?}");

  let tools = service.list_tools(Default::default()).await?;
  println!("Available tools: {tools:#?}");

  let tool_result = service.call_tool(CallToolRequestParam { name: "battery_level".into(), arguments: None }).await?;
  println!("Tool result: {tool_result:#?}");

  app_lib::run();

  service.cancel().await?;
  println!("Disconnected from server");

  Ok(())
}
