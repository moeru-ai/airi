// Auth commands matching apps/stage-tamagotchi/src/shared/eventa contracts
// All commands use placeholder implementations

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub expires_in: i64,
}

/// Start OIDC login flow - placeholder
#[tauri::command]
pub async fn electron_auth_start_login() -> Result<(), String> {
    // Placeholder: real implementation starts loopback server + opens browser
    Ok(())
}

/// Logout - clears stored token - placeholder
#[tauri::command]
pub async fn electron_auth_logout() -> Result<(), String> {
    Ok(())
}
