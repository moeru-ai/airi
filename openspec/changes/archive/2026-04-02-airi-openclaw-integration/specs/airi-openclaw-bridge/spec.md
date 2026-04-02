## ADDED Requirements

### Requirement: Intent routing between chat and tasks
The system SHALL classify each incoming user message as chat, task, or mixed before deciding whether to invoke OpenClaw.

#### Scenario: Pure chat stays in AIRI
- **WHEN** the user message is classified as chat
- **THEN** the system SHALL respond through AIRI without delegating to OpenClaw

#### Scenario: Task request is delegated
- **WHEN** the user message is classified as task
- **THEN** the system SHALL send the task to OpenClaw for execution

#### Scenario: Mixed input is split
- **WHEN** the user message contains both conversational content and an actionable task
- **THEN** the system SHALL delegate the task portion to OpenClaw and preserve the conversational response in AIRI

### Requirement: Structured execution request
The system SHALL send a structured request to OpenClaw for delegated work.

#### Scenario: Request contains routing context
- **WHEN** the system delegates a task to OpenClaw
- **THEN** the request SHALL include the task text, source, user identifier, conversation identifier, context, and return mode

#### Scenario: Request remains machine-readable
- **WHEN** the system creates the bridge payload
- **THEN** the payload SHALL be structured data rather than an untyped free-form string only

### Requirement: Delegated task execution lifecycle
The system SHALL represent each delegated OpenClaw task with a stable task identifier and a minimal lifecycle that the service-side adapter owns.

#### Scenario: Delegation creates a task record
- **WHEN** AIRI delegates a task to OpenClaw
- **THEN** the service-side adapter SHALL create or return a task identifier for that delegated work
- **AND** the task SHALL enter the `queued` status before execution begins

#### Scenario: Task status updates remain machine-readable
- **WHEN** a delegated task changes execution state
- **THEN** the service-side adapter SHALL expose a structured status update containing at least the task identifier, the current status, and a timestamp or equivalent ordering field
- **AND** the allowed statuses SHALL include `queued`, `running`, `completed`, `failed`, and `cancelled`

#### Scenario: Successful task completes with final status
- **WHEN** OpenClaw finishes delegated work successfully
- **THEN** the task status SHALL transition to `completed`
- **AND** the final structured result SHALL remain associated with the same task identifier

#### Scenario: Interrupted task is cancelled distinctly from failure
- **WHEN** delegated work is intentionally stopped or interrupted
- **THEN** the task status SHALL transition to `cancelled`
- **AND** the system SHALL not collapse that outcome into `failed`

### Requirement: Structured execution result handling
The system SHALL accept structured OpenClaw results and convert successful outcomes into persona-consistent AIRI replies.

#### Scenario: Successful result is rewritten
- **WHEN** OpenClaw returns a successful structured result
- **THEN** AIRI SHALL present the outcome in its own persona style instead of forwarding raw execution text

#### Scenario: Failed result is surfaced safely
- **WHEN** OpenClaw returns a failure result
- **THEN** AIRI SHALL surface a user-facing failure message without exposing internal implementation details that are not needed for the user

### Requirement: Execution memory is separate from relationship memory
The system SHALL keep execution history and structured tool output separate from AIRI relationship memory.

#### Scenario: Relationship memory remains intact
- **WHEN** a task completes
- **THEN** the system SHALL preserve AIRI relationship memory without overwriting it with execution logs

#### Scenario: Execution history store is owned by the service adapter
- **WHEN** the system persists or retains delegated-task history
- **THEN** the service-side adapter SHALL own the execution-history store or equivalent persistence boundary
- **AND** AIRI `stage-ui` SHALL consume only the summaries or structured results needed for routing and reply shaping

#### Scenario: Execution history retains lifecycle details
- **WHEN** OpenClaw completes, fails, or cancels a task
- **THEN** the execution-history record SHALL retain the task identifier, lifecycle status changes, and the final structured result or error summary for debugging and audit purposes
