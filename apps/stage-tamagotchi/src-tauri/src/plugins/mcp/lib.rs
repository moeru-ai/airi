use rmcp::{service::RunningService, RoleClient};

pub struct McpState {
  pub client: Option<RunningService<RoleClient, ()>>,
}
