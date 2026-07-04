// i18n commands matching apps/stage-tamagotchi/src/shared/eventa contracts
// All commands use placeholder implementations
/// Set locale - placeholder
#[tauri::command]
pub async fn electron_i18n_set_locale(
    _locale: Option<String>,
) -> Result<(), String> {
    Ok(())
}

/// Get current locale - placeholder
#[tauri::command]
pub async fn electron_i18n_get_locale() -> String {
    "en".to_string()
}
