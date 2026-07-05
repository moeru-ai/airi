use serde::Serialize;
use std::fmt::Write;
use tauri::{
    AppHandle, LogicalPosition, Manager, Monitor, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct ManagedWindowSpec {
    pub(crate) label: &'static str,
    pub(crate) route: &'static str,
    pub(crate) title: &'static str,
    pub(crate) width: f64,
    pub(crate) height: f64,
    pub(crate) min_width: Option<f64>,
    pub(crate) min_height: Option<f64>,
    pub(crate) transparent: bool,
    pub(crate) decorations: bool,
    pub(crate) always_on_top: bool,
    pub(crate) skip_taskbar: bool,
    pub(crate) focusable: bool,
}

#[derive(Debug, Default)]
pub(crate) struct OpenManagedWindowOptions {
    pub(crate) label: String,
    pub(crate) route: Option<String>,
    pub(crate) window_label: Option<String>,
    pub(crate) width: Option<f64>,
    pub(crate) height: Option<f64>,
    pub(crate) x: Option<f64>,
    pub(crate) y: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenedManagedWindow {
    pub(crate) label: String,
    pub(crate) route: String,
    pub(crate) reused: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct LogicalDisplayBounds {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct LogicalWindowPosition {
    pub(crate) x: f64,
    pub(crate) y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum InitialWindowPosition {
    Explicit(LogicalWindowPosition),
    DisplayCentered(LogicalWindowPosition),
    TauriCenter,
}

const MANAGED_WINDOW_SPECS: &[ManagedWindowSpec] = &[
    ManagedWindowSpec {
        label: "settings",
        route: "/settings",
        title: "Settings",
        width: 600.0,
        height: 800.0,
        min_width: None,
        min_height: None,
        transparent: false,
        decorations: true,
        always_on_top: false,
        skip_taskbar: false,
        focusable: true,
    },
    ManagedWindowSpec {
        label: "chat",
        route: "/chat",
        title: "Chat",
        width: 600.0,
        height: 800.0,
        min_width: None,
        min_height: None,
        transparent: false,
        decorations: true,
        always_on_top: false,
        skip_taskbar: false,
        focusable: true,
    },
    ManagedWindowSpec {
        label: "widgets",
        route: "/widgets",
        title: "Widgets",
        width: 620.0,
        height: 760.0,
        min_width: None,
        min_height: None,
        transparent: true,
        decorations: false,
        always_on_top: true,
        skip_taskbar: false,
        focusable: true,
    },
    ManagedWindowSpec {
        label: "caption",
        route: "/caption",
        title: "Caption",
        width: 480.0,
        height: 180.0,
        min_width: None,
        min_height: None,
        transparent: true,
        decorations: false,
        always_on_top: true,
        skip_taskbar: false,
        focusable: false,
    },
    ManagedWindowSpec {
        label: "notice",
        route: "/notice/fade-on-hover",
        title: "Notice",
        width: 1020.0,
        height: 600.0,
        min_width: None,
        min_height: None,
        transparent: false,
        decorations: true,
        always_on_top: false,
        skip_taskbar: false,
        focusable: true,
    },
    ManagedWindowSpec {
        label: "about",
        route: "/about",
        title: "About AIRI",
        width: 670.0,
        height: 880.0,
        min_width: None,
        min_height: None,
        transparent: false,
        decorations: true,
        always_on_top: false,
        skip_taskbar: false,
        focusable: true,
    },
    ManagedWindowSpec {
        label: "onboarding",
        route: "/onboarding",
        title: "Onboarding",
        width: 1000.0,
        height: 650.0,
        min_width: Some(400.0),
        min_height: Some(500.0),
        transparent: false,
        decorations: true,
        always_on_top: false,
        skip_taskbar: false,
        focusable: true,
    },
    ManagedWindowSpec {
        label: "devtools",
        route: "/devtools",
        title: "Devtools",
        width: 1020.0,
        height: 720.0,
        min_width: Some(640.0),
        min_height: Some(480.0),
        transparent: false,
        decorations: true,
        always_on_top: false,
        skip_taskbar: false,
        focusable: true,
    },
    ManagedWindowSpec {
        label: "beat-sync",
        route: "/beat-sync",
        title: "Beat sync",
        width: 320.0,
        height: 240.0,
        min_width: None,
        min_height: None,
        transparent: false,
        decorations: true,
        always_on_top: false,
        skip_taskbar: true,
        focusable: false,
    },
    ManagedWindowSpec {
        label: "inlay",
        route: "/inlay",
        title: "Inlay",
        width: 450.0,
        height: 150.0,
        min_width: None,
        min_height: None,
        transparent: true,
        decorations: false,
        always_on_top: false,
        skip_taskbar: false,
        focusable: false,
    },
    ManagedWindowSpec {
        label: "dashboard",
        route: "/dashboard",
        title: "Dashboard",
        width: 1200.0,
        height: 600.0,
        min_width: None,
        min_height: None,
        transparent: true,
        decorations: true,
        always_on_top: false,
        skip_taskbar: false,
        focusable: true,
    },
];

pub(crate) fn managed_window_specs() -> &'static [ManagedWindowSpec] {
    MANAGED_WINDOW_SPECS
}

pub(crate) fn spec_for_label(label: &str) -> Option<&'static ManagedWindowSpec> {
    managed_window_specs()
        .iter()
        .find(|spec| spec.label == label)
}

pub(crate) fn normalize_route(route: &str) -> String {
    let route = route.strip_prefix('#').unwrap_or(route);
    if route.is_empty() {
        return "/".to_string();
    }
    if route.starts_with('/') {
        route.to_string()
    } else {
        format!("/{route}")
    }
}

pub(crate) fn route_with_query(route: &str, key: &str, value: &str) -> String {
    let (base, query) = route.split_once('?').unwrap_or((route, ""));
    let encoded_pair = format!("{key}={}", encode_query_component(value));
    let mut pairs = query
        .split('&')
        .filter(|part| {
            if part.is_empty() {
                return false;
            }
            let existing_key = part.split_once('=').map_or(*part, |(key, _)| key);
            existing_key != key
        })
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    pairs.push(encoded_pair);
    format!("{base}?{}", pairs.join("&"))
}

fn encode_query_component(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                let _ = write!(encoded, "%{byte:02X}");
            }
        }
    }
    encoded
}

pub(crate) fn stable_child_label(base: &str, key: &str) -> String {
    let mut sanitized = String::with_capacity(key.len());
    for byte in key.bytes() {
        match byte {
            b'A'..=b'Z' => sanitized.push((byte as char).to_ascii_lowercase()),
            b'a'..=b'z' | b'0'..=b'9' | b'-' => sanitized.push(byte as char),
            _ => {
                let _ = write!(sanitized, "-{byte:02x}");
            }
        }
    }

    if sanitized.is_empty() {
        base.to_string()
    } else {
        format!("{base}-{sanitized}-{:016x}", stable_key_hash(key))
    }
}

fn stable_key_hash(key: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in key.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn app_url() -> WebviewUrl {
    WebviewUrl::App("index.html".into())
}

fn monitor_work_area_bounds(monitor: &Monitor) -> LogicalDisplayBounds {
    let work_area = monitor.work_area();
    let scale_factor = monitor.scale_factor();
    let scale_factor = if scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };

    LogicalDisplayBounds {
        x: work_area.position.x as f64 / scale_factor,
        y: work_area.position.y as f64 / scale_factor,
        width: work_area.size.width as f64 / scale_factor,
        height: work_area.size.height as f64 / scale_factor,
    }
}

fn center_window_position(
    width: f64,
    height: f64,
    display: LogicalDisplayBounds,
) -> LogicalWindowPosition {
    LogicalWindowPosition {
        x: display.x + ((display.width - width).max(0.0) / 2.0),
        y: display.y + ((display.height - height).max(0.0) / 2.0),
    }
}

pub(crate) fn resolve_initial_window_position(
    width: f64,
    height: f64,
    explicit_position: Option<(f64, f64)>,
    target_display: Option<LogicalDisplayBounds>,
) -> InitialWindowPosition {
    if let Some((x, y)) = explicit_position {
        return InitialWindowPosition::Explicit(LogicalWindowPosition { x, y });
    }

    if let Some(display) = target_display {
        return InitialWindowPosition::DisplayCentered(center_window_position(
            width, height, display,
        ));
    }

    InitialWindowPosition::TauriCenter
}

fn target_display_for_new_window(app: &AppHandle) -> Result<Option<LogicalDisplayBounds>, String> {
    if let Some(main_window) = app.get_webview_window("main") {
        if let Some(monitor) = main_window.current_monitor().map_err(|e| e.to_string())? {
            return Ok(Some(monitor_work_area_bounds(&monitor)));
        }
    }

    let cursor = match app.cursor_position() {
        Ok(cursor) => cursor,
        Err(_) => return Ok(None),
    };

    Ok(app
        .monitor_from_point(cursor.x, cursor.y)
        .map_err(|e| e.to_string())?
        .map(|monitor| monitor_work_area_bounds(&monitor)))
}

fn apply_initial_window_position<'a, R, M>(
    builder: WebviewWindowBuilder<'a, R, M>,
    position: InitialWindowPosition,
) -> WebviewWindowBuilder<'a, R, M>
where
    R: tauri::Runtime,
    M: Manager<R>,
{
    match position {
        InitialWindowPosition::Explicit(position)
        | InitialWindowPosition::DisplayCentered(position) => {
            builder.position(position.x, position.y)
        }
        InitialWindowPosition::TauriCenter => builder.center(),
    }
}

pub(crate) fn apply_main_window_display_features(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    window.set_always_on_top(true).map_err(|e| e.to_string())?;

    let cursor = match app.cursor_position() {
        Ok(cursor) => cursor,
        Err(_) => return Ok(()),
    };
    let Some(monitor) = app
        .monitor_from_point(cursor.x, cursor.y)
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };

    let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
    let size = window
        .outer_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale_factor);
    let position =
        center_window_position(size.width, size.height, monitor_work_area_bounds(&monitor));
    window
        .set_position(LogicalPosition::new(position.x, position.y))
        .map_err(|e| e.to_string())
}

fn route_initialization_script(route: &str) -> Result<String, String> {
    let hash = format!("#{route}");
    let hash_literal = serde_json::to_string(&hash).map_err(|e| e.to_string())?;
    Ok(format!("window.location.hash = {hash_literal};"))
}

fn set_window_hash_route(window: &WebviewWindow, route: &str) -> Result<(), String> {
    let hash = format!("#{route}");
    let hash_literal = serde_json::to_string(&hash).map_err(|e| e.to_string())?;
    window
        .eval(format!("window.location.hash = {hash_literal};"))
        .map_err(|e| e.to_string())
}

pub(crate) fn open_managed_window(
    app: &AppHandle,
    options: OpenManagedWindowOptions,
) -> Result<OpenedManagedWindow, String> {
    let spec = spec_for_label(&options.label)
        .ok_or_else(|| format!("unknown managed window label: {}", options.label))?;
    let route = normalize_route(options.route.as_deref().unwrap_or(spec.route));
    let label = options
        .window_label
        .unwrap_or_else(|| spec.label.to_string());

    if let Some(window) = app.get_webview_window(&label) {
        set_window_hash_route(&window, &route)?;
        window.show().map_err(|e| e.to_string())?;
        if spec.focusable {
            window.set_focus().map_err(|e| e.to_string())?;
        }
        return Ok(OpenedManagedWindow {
            label,
            route,
            reused: true,
        });
    }

    let width = options.width.unwrap_or(spec.width);
    let height = options.height.unwrap_or(spec.height);
    let mut builder = WebviewWindowBuilder::new(app, label.clone(), app_url())
        .title(spec.title)
        .inner_size(width, height)
        .decorations(spec.decorations)
        .transparent(spec.transparent)
        .always_on_top(spec.always_on_top)
        .skip_taskbar(spec.skip_taskbar)
        .focusable(spec.focusable)
        .visible(true)
        .initialization_script(route_initialization_script(&route)?);

    if let (Some(min_width), Some(min_height)) = (spec.min_width, spec.min_height) {
        builder = builder.min_inner_size(min_width, min_height);
    }

    builder = apply_initial_window_position(
        builder,
        resolve_initial_window_position(
            width,
            height,
            options.x.zip(options.y),
            target_display_for_new_window(app)?,
        ),
    );

    let window = builder.build().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    if spec.focusable {
        window.set_focus().map_err(|e| e.to_string())?;
    }

    Ok(OpenedManagedWindow {
        label,
        route,
        reused: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn includes_every_window_required_by_multi_window_feature() {
        let labels: Vec<&str> = managed_window_specs()
            .iter()
            .map(|spec| spec.label)
            .collect();

        assert_eq!(
            labels,
            vec![
                "settings",
                "chat",
                "widgets",
                "caption",
                "notice",
                "about",
                "onboarding",
                "devtools",
                "beat-sync",
                "inlay",
                "dashboard",
            ]
        );
    }

    #[test]
    fn preserves_overlay_flags_for_transparent_windows() {
        let specs = managed_window_specs();
        let widgets = specs.iter().find(|spec| spec.label == "widgets").unwrap();
        let caption = specs.iter().find(|spec| spec.label == "caption").unwrap();
        let inlay = specs.iter().find(|spec| spec.label == "inlay").unwrap();

        assert_eq!(
            (
                widgets.transparent,
                widgets.decorations,
                widgets.always_on_top,
                widgets.focusable
            ),
            (true, false, true, true)
        );
        assert_eq!(
            (
                caption.transparent,
                caption.decorations,
                caption.always_on_top,
                caption.focusable
            ),
            (true, false, true, false)
        );
        assert_eq!(
            (
                inlay.transparent,
                inlay.decorations,
                inlay.always_on_top,
                inlay.focusable
            ),
            (true, false, false, false)
        );
    }

    #[test]
    fn uses_hash_routes_that_the_tauri_renderer_can_classify() {
        let routes: Vec<&str> = managed_window_specs()
            .iter()
            .map(|spec| spec.route)
            .collect();

        assert_eq!(
            routes,
            vec![
                "/settings",
                "/chat",
                "/widgets",
                "/caption",
                "/notice/fade-on-hover",
                "/about",
                "/onboarding",
                "/devtools",
                "/beat-sync",
                "/inlay",
                "/dashboard",
            ]
        );
    }

    #[test]
    fn normalizes_route_input_for_hash_urls() {
        assert_eq!(normalize_route("settings"), "/settings");
        assert_eq!(normalize_route("#/chat"), "/chat");
        assert_eq!(normalize_route(""), "/");
    }

    #[test]
    fn query_values_are_percent_encoded() {
        assert_eq!(
            route_with_query("/widgets", "id", "a/b & c=d#e%f"),
            "/widgets?id=a%2Fb%20%26%20c%3Dd%23e%25f"
        );
        assert_eq!(
            route_with_query("/notice/fade-on-hover?source=stage", "id", "notice 1"),
            "/notice/fade-on-hover?source=stage&id=notice%201"
        );
        assert_eq!(
            route_with_query("/notice?id=old&source=stage", "id", "notice-1"),
            "/notice?source=stage&id=notice-1"
        );
    }

    #[test]
    fn creates_stable_child_labels_from_user_supplied_keys() {
        assert!(stable_child_label("devtools", "io-tracer").starts_with("devtools-io-tracer-"));
        assert!(stable_child_label("notice", "Notice 1").starts_with("notice-notice-201-"));
        assert_eq!(stable_child_label("notice", ""), "notice");
        assert_ne!(
            stable_child_label("widgets", "Foo"),
            stable_child_label("widgets", "foo")
        );
        assert_ne!(
            stable_child_label("widgets", "a/b"),
            stable_child_label("widgets", "a b")
        );
        assert_ne!(
            stable_child_label("widgets", "a b"),
            stable_child_label("widgets", "a_b")
        );
        assert_ne!(
            stable_child_label("widgets", "a/"),
            stable_child_label("widgets", "a-2f")
        );
    }

    #[test]
    fn explicit_coordinates_take_precedence_over_display_centering() {
        let display = LogicalDisplayBounds {
            x: 1920.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };

        assert_eq!(
            resolve_initial_window_position(480.0, 720.0, Some((64.0, 96.0)), Some(display)),
            InitialWindowPosition::Explicit(LogicalWindowPosition { x: 64.0, y: 96.0 })
        );
    }

    #[test]
    fn centers_default_window_position_on_target_display() {
        let display = LogicalDisplayBounds {
            x: 1920.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };

        assert_eq!(
            resolve_initial_window_position(480.0, 720.0, None, Some(display)),
            InitialWindowPosition::DisplayCentered(LogicalWindowPosition { x: 2400.0, y: 90.0 })
        );
    }

    #[test]
    fn keeps_oversized_windows_inside_target_display_origin() {
        let display = LogicalDisplayBounds {
            x: -1600.0,
            y: 32.0,
            width: 320.0,
            height: 240.0,
        };

        assert_eq!(
            resolve_initial_window_position(480.0, 720.0, None, Some(display)),
            InitialWindowPosition::DisplayCentered(LogicalWindowPosition {
                x: -1600.0,
                y: 32.0
            })
        );
    }

    #[test]
    fn falls_back_to_tauri_center_without_target_display() {
        assert_eq!(
            resolve_initial_window_position(480.0, 720.0, None, None),
            InitialWindowPosition::TauriCenter
        );
    }
}
