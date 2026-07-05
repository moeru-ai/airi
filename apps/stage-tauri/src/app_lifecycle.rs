use serde::{Deserialize, Serialize};

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";
const WINDOW_STATE_FILE: &str = "main-window-state.json";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WindowGeometry {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedMainWindowState {
    pub(crate) geometry: Option<WindowGeometry>,
    pub(crate) transparent: bool,
}

pub(crate) fn window_state_file_name() -> &'static str {
    WINDOW_STATE_FILE
}

pub(crate) fn valid_geometry(geometry: &WindowGeometry) -> bool {
    geometry.x.is_finite()
        && geometry.y.is_finite()
        && geometry.width.is_finite()
        && geometry.height.is_finite()
        && geometry.width >= 100.0
        && geometry.height >= 100.0
}

pub(crate) fn merge_saved_state(
    saved: Option<PersistedMainWindowState>,
    fallback: PersistedMainWindowState,
) -> PersistedMainWindowState {
    saved.unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unusable_window_geometry() {
        assert!(!valid_geometry(&WindowGeometry {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 720.0,
        }));
        assert!(!valid_geometry(&WindowGeometry {
            x: 0.0,
            y: 0.0,
            width: 480.0,
            height: 0.0,
        }));
        assert!(!valid_geometry(&WindowGeometry {
            x: f64::NAN,
            y: 0.0,
            width: 480.0,
            height: 720.0,
        }));
        assert!(valid_geometry(&WindowGeometry {
            x: 10.0,
            y: 20.0,
            width: 480.0,
            height: 720.0,
        }));
    }

    #[test]
    fn keeps_configured_transparency_when_saved_state_omits_it() {
        let fallback = PersistedMainWindowState {
            geometry: None,
            transparent: true,
        };
        let saved = PersistedMainWindowState {
            geometry: Some(WindowGeometry {
                x: 10.0,
                y: 20.0,
                width: 640.0,
                height: 480.0,
            }),
            transparent: false,
        };

        assert_eq!(
            merge_saved_state(Some(saved), fallback),
            PersistedMainWindowState {
                geometry: Some(WindowGeometry {
                    x: 10.0,
                    y: 20.0,
                    width: 640.0,
                    height: 480.0,
                }),
                transparent: false,
            }
        );
        assert_eq!(
            merge_saved_state(None, fallback),
            PersistedMainWindowState {
                geometry: None,
                transparent: true,
            }
        );
    }
}
