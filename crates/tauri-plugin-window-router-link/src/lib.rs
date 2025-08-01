use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
#[cfg(debug_assertions)]
use specta_typescript::Typescript;
use tauri::{
  Manager,
  Runtime,
  plugin::{Builder, TauriPlugin},
  webview::{PageLoadEvent, PageLoadPayload},
};

pub type PageLoadHandler<R> =
  Option<Arc<dyn Fn(tauri::WebviewWindow<R>, PageLoadPayload) + Send + Sync>>;

pub type WindowCreator<R> = Box<
  dyn Fn(tauri::AppHandle<R>, PageLoadHandler<R>) -> Result<tauri::WebviewWindow<R>> + Send + Sync,
>;

// Define a matcher struct that holds window creation logic
pub struct WindowMatcher<R: Runtime> {
  creators: HashMap<String, WindowCreator<R>>,
}

impl<R: Runtime> WindowMatcher<R> {
  pub fn new() -> Self {
    Self {
      creators: HashMap::new(),
    }
  }

  pub fn register<F>(
    mut self,
    label: &str,
    creator: F,
  ) -> Self
  where
    F: Fn(tauri::AppHandle<R>, PageLoadHandler<R>) -> Result<tauri::WebviewWindow<R>>
      + Send
      + Sync
      + 'static,
  {
    self
      .creators
      .insert(label.to_string(), Box::new(creator));
    self
  }

  pub fn get_or_create_window(
    &self,
    app: tauri::AppHandle<R>,
    label: &str,
    custom_page_load_handler: PageLoadHandler<R>,
  ) -> Result<tauri::WebviewWindow<R>, String> {
    // First try to get existing window
    if let Some(window) = app.get_webview_window(label) {
      return Ok(window);
    }

    // If no existing window, try to create one using registered creator
    match self.creators.get(label) {
      Some(creator) => creator(app, custom_page_load_handler)
        .map_err(|e| format!("Failed to create {} window: {}", label, e)),
      None => Err(format!("Unknown window label: {}", label)),
    }
  }
}

#[tauri::command]
#[specta::specta]
async fn go<R: Runtime>(
  app_handle: tauri::AppHandle<R>,
  route: String,
  // ↓ #[specta(optional)] is not available in parameters.
  // ↓ This will be `string | null` in the generated TypeScript code
  window_label: Option<String>,
) -> std::result::Result<(), String> {
  let window_label = window_label.ok_or("Missing window label")?;
  let matcher = app_handle.state::<WindowMatcher<R>>();

  matcher.get_or_create_window(
    app_handle.clone(),
    &window_label,
    Some(Arc::new(
      move |target_window: tauri::WebviewWindow<R>, load| {
        match load.event() {
          PageLoadEvent::Finished => {
            let current_url = target_window
              .url()
              .map_err(|e| format!("Failed to get current URL: {}", e));
            if let Ok(mut current_url) = current_url {
              let route: String = "/".to_string() + route.trim_start_matches('/');
              current_url.set_fragment(Some(route.to_string().as_str()));

              let _ = target_window.show();
              if let Ok(url) = target_window.url() {
                if url == current_url {
                  // If the URL is already the same, we don't need to navigate again.
                  return;
                }

                let _ = target_window.navigate(current_url);
              }
            }
          },
          _ => {},
        }
      },
    )),
  )?;

  Ok(())
}

const PLUGIN_NAME: &str = "window-router-link";

pub fn init<R: Runtime>(matcher: WindowMatcher<R>) -> TauriPlugin<R> {
  let builder = tauri_specta::Builder::<R>::new()
    .plugin_name(PLUGIN_NAME)
    .commands(tauri_specta::collect_commands![go::<tauri::Wry>]);

  #[cfg(debug_assertions)]
  builder
    .export(
      Typescript::default().header("// @ts-nocheck\n"),
      "../src/bindings/tauri-plugins/window-router-link.ts",
    )
    .expect("Failed to export typescript bindings");

  Builder::new(PLUGIN_NAME)
    .invoke_handler(builder.invoke_handler())
    .setup(move |app, _| {
      app.manage(matcher);
      Ok(())
    })
    .build()
}
