use rmcp::{service::RunningService, transport::TokioChildProcess, RoleClient, ServiceExt};
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
async fn list_tools(state: State<'_, Mutex<McpState>>) -> Result<Vec<String>, String> {
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
async fn call_tool(state: State<'_, Mutex<McpState>>, tool_name: String, arguments: String) -> Result<Vec<String>, String> {
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
      .invoke_handler(tauri::generate_handler![connect_server, list_tools, call_tool])
      .setup(|app_handle, _| {
        app_handle.manage(Mutex::new(McpState { client: None }));
        Ok(())
      })
      .build()
  }
}
