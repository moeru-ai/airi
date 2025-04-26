use rmcp::model::CallToolRequestParam;
use rmcp::{service::RunningService, transport::TokioChildProcess, RoleClient, ServiceExt};
use tauri::State;
use tokio::sync::Mutex;
use tokio::process::Command;

use super::lib::McpState;

#[tauri::command]
pub async fn connect_server(state: State<'_, Mutex<McpState>>, command: String, args: Vec<String>) -> Result<(), ()> {
  let mut state = state.lock().await;

  let child_process = TokioChildProcess::new(
    Command::new(command).args(args)
  ).unwrap();

  let service: RunningService<RoleClient, ()> = ().serve(child_process).await.unwrap();

  state.client = Some(service);

  Ok(())
}

#[tauri::command]
pub async fn list_tools(state: State<'_, Mutex<McpState>>) -> Result<Vec<String>, String> {
  let state = state.lock().await;
  let client = state.client.as_ref();
  if client.is_none() {
    return Err("Client not connected".to_string());
  }

  let list_tools_result = client.unwrap().list_tools(Default::default()).await.unwrap();
  let tools = list_tools_result.tools;

  let tool_names = tools.into_iter().map(|tool| tool.name.into()).collect::<Vec<String>>();

  println!("Tools: {:?}", tool_names);

  Ok(tool_names)
}

#[tauri::command]
pub async fn call_tool(state: State<'_, Mutex<McpState>>, tool_name: String, arguments: String) -> Result<Vec<String>, String> {
  println!("Calling tool: {:?}", tool_name);
  println!("Arguments: {:?}", arguments);

  let state = state.lock().await;
  let client = state.client.as_ref();
  if client.is_none() {
    return Err("Client not connected".to_string());
  }

  // json parse to map
  let arguments = serde_json::from_str(&arguments).unwrap();
  let call_tool_result = client.unwrap().call_tool(CallToolRequestParam { name: tool_name.into(), arguments: Some(arguments) }).await.unwrap();

  println!("Tool result: {:?}", call_tool_result);

  // TODO: better response
  Ok(call_tool_result.content.into_iter().map(|content| content.raw.as_text().unwrap().text.clone()).collect::<Vec<String>>())
}
