use std::process::Stdio;

use log::info;
use rmcp::{
  model::{CallToolRequestParam, CallToolResult, Tool},
  service::RunningService,
  transport::TokioChildProcess,
  RoleClient,
  ServiceExt,
};
use serde_json::{Map, Value};
use tauri::{
  plugin::{self, TauriPlugin},
  AppHandle,
  Manager,
  Runtime,
  State,
};
use tokio::{process::Command, sync::Mutex};

pub struct McpState {
  pub client: Option<RunningService<RoleClient, ()>>,
}

#[allow(clippy::missing_panics_doc)]
pub fn destroy<R: Runtime>(app_handle: &AppHandle<R>) {
  info!("Destroying MCP plugin");

  tokio::runtime::Runtime::new()
    .unwrap()
    .block_on(async {
      let state = app_handle.state::<Mutex<McpState>>();

      let mut state = state.lock().await;
      if state.client.is_none() {
        info!("MCP plugin not connected, no need to disconnect");
        return;
      }

      let client = state.client.take().unwrap();
      drop(state);

      client.cancel().await.unwrap();
      // client.waiting().await.unwrap();
    });

  info!("MCP plugin destroyed");
}

#[tauri::command]
async fn connect_server(
  state: State<'_, Mutex<McpState>>,
  command: String,
  args: Vec<String>,
) -> Result<(), String> {
  let mut state = state.lock().await;

  if state.client.is_some() {
    return Err("Client already connected".to_string());
  }

  let child_process = TokioChildProcess::new(
    Command::new(command)
      .args(args)
      .stderr(Stdio::inherit())
      .stdout(Stdio::inherit()),
  )
  .unwrap();

  let service: RunningService<RoleClient, ()> = ().serve(child_process).await.unwrap();

  state.client = Some(service);
  drop(state);

  Ok(())
}

#[tauri::command]
async fn disconnect_server(state: State<'_, Mutex<McpState>>) -> Result<(), String> {
  let mut state = state.lock().await;
  if state.client.is_none() {
    return Err("Client not connected".to_string());
  }

  let cancel_result = state.client.take().unwrap().cancel().await;
  info!("Cancel result: {cancel_result:?}");
  // state.client.take().unwrap().waiting().await.unwrap();
  drop(state);

  info!("Disconnected from MCP server");

  Ok(())
}

#[tauri::command]
async fn list_tools(state: State<'_, Mutex<McpState>>) -> Result<Vec<Tool>, String> {
  let state = state.lock().await;
  let client = state.client.as_ref();
  if client.is_none() {
    return Err("Client not connected".to_string());
  }

  let list_tools_result = client
    .unwrap()
    .list_tools(Option::default())
    .await
    .unwrap(); // TODO: handle error
  let tools = list_tools_result.tools;
  drop(state);

  Ok(tools)
}

#[tauri::command]
async fn call_tool(
  state: State<'_, Mutex<McpState>>,
  name: String,
  args: Option<Map<String, Value>>,
) -> Result<CallToolResult, String> {
  info!("Calling tool: {name:?}");
  info!("Arguments: {args:?}");

  let state = state.lock().await;
  let client = state.client.as_ref();
  if client.is_none() {
    return Err("Client not connected".to_string());
  }

  let call_tool_result = client
    .unwrap()
    .call_tool(CallToolRequestParam {
      name:      name.into(),
      arguments: args,
    })
    .await
    .unwrap();
  drop(state);

  info!("Tool result: {call_tool_result:?}");

  Ok(call_tool_result)
}

#[derive(Default)]
pub struct Builder;

impl Builder {
  #[must_use]
  pub fn build<R: Runtime>(self) -> TauriPlugin<R> {
    info!("Building MCP plugin");

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
      .on_drop(|app_handle: AppHandle<R>| {
        destroy(&app_handle);
      })
      .build()
  }
}
