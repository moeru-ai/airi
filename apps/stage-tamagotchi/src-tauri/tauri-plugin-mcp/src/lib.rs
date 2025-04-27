use rmcp::{model::{CallToolResult, Tool}, service::RunningService, transport::TokioChildProcess, RoleClient, ServiceExt};
use serde_json::{Map, Value};
use tauri::{plugin::{self, TauriPlugin}, Manager, Runtime};
use tokio::sync::Mutex;
use rmcp::model::CallToolRequestParam;
use tauri::State;
use tokio::process::Command;

pub struct McpState {
  pub client: Option<RunningService<RoleClient, ()>>,
}

#[tauri::command]
async fn connect_server(state: State<'_, Mutex<McpState>>, command: String, args: Vec<String>) -> Result<(), String> {
  let mut state = state.lock().await;

  if state.client.is_some() {
    return Err("Client already connected".to_string());
  }

  let child_process = TokioChildProcess::new(
    Command::new(command).args(args)
  ).unwrap();

  let service: RunningService<RoleClient, ()> = ().serve(child_process).await.unwrap();

  state.client = Some(service);

  Ok(())
}

#[tauri::command]
async fn disconnect_server(state: State<'_, Mutex<McpState>>) -> Result<(), String> {
  let mut state = state.lock().await;
  if state.client.is_none() {
    return Err("Client not connected".to_string());
  }

  state.client.take().unwrap().cancel().await.unwrap();
  state.client = None;

  Ok(())
}

#[tauri::command]
async fn list_tools(state: State<'_, Mutex<McpState>>) -> Result<Vec<Tool>, String> {
  let state = state.lock().await;
  let client = state.client.as_ref();
  if client.is_none() {
    return Err("Client not connected".to_string());
  }

  let list_tools_result = client.unwrap().list_tools(Default::default()).await.unwrap();
  let tools = list_tools_result.tools;

  Ok(tools)
}

#[tauri::command]
async fn call_tool(state: State<'_, Mutex<McpState>>, name: String, args: Option<Map<String, Value>>) -> Result<CallToolResult, String> {
  println!("Calling tool: {:?}", name);
  println!("Arguments: {:?}", args);

  let state = state.lock().await;
  let client = state.client.as_ref();
  if client.is_none() {
    return Err("Client not connected".to_string());
  }

  let call_tool_result = client.unwrap().call_tool(CallToolRequestParam { name: name.into(), arguments: args }).await.unwrap();

  println!("Tool result: {:?}", call_tool_result);

  Ok(call_tool_result)
}

pub struct Builder;

impl Default for Builder {
  fn default() -> Self {
    Self {}
  }
}

impl Builder {
  pub fn build<R: Runtime>(self) -> TauriPlugin<R> {
    println!("Building MCP plugin");

    plugin::Builder::new("mcp")
      .invoke_handler(tauri::generate_handler![
        connect_server,
        disconnect_server,
        list_tools,
        call_tool
      ])
      .setup(|app_handle, _| {
        app_handle.manage(Mutex::new(McpState { client: None }));
        Ok(())
      })
      .build()
  }
}
