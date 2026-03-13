# Proactive Agent: "Heartbeats" System Design

## 1. Concept Overview
The "Heartbeats" system transforms the AIRI agent from a purely reactive entity (waiting for user input) into a proactive companion.
Driven by a cron-like interval timer, the system evaluates the user's current context (time, keyboard/mouse activity, active window) against user-defined heuristic gates. If the context parses the gates, the data is fed to the LLM to make a final decision: initiate a conversation (triggering TTS and animations) or remain silent (`NO_REPLY`).

---

## 2. UI Placement: Where does this live?
Currently, an AIRI card has 4 tabs: **Identity**, **Behavior**, **Modules**, and **Settings**.

**Recommendation: A new "Proactivity" tab.**
*Why?* The existing tabs manage the *reactive* state of the AI. "Behavior" defines *how* it responds to your prompt, and "Settings" configures the LLM backend parameters for those prompts.
Heartbeats introduce a completely new paradigm (Push vs. Pull) with complex configurations (schedules, activity checkboxes, independent system prompts). Forcing this into "Behavior" or "Settings" would clutter the UI and obscure the distinct nature of the proactivity engine.
*Alternative*: If we must use an existing tab, **Behavior** is the closest semantic fit, perhaps under a collapsible "Autonomous Behavior" section.

---

## 3. Configuration Data Model (The UI Settings)

The user will configure the following parameters:

```typescript
interface HeartbeatConfig {
  enabled: boolean

  // Timing
  intervalMinutes: number // e.g., 30
  schedule: {
    start: string // "09:00"
    end: string // "23:00"
  }

  // The Persona Context for Proactivity
  systemPrompt: string // e.g., "I want you to ask me how I'm doing and offer to make me a pic. Use NO_REPLY if my active window is Microsoft Teams."

  // Activity Loggers (Separation of Local Gates vs Provider Context)
  activityLoggers: {
    keyboard: {
      useAsLocalGate: boolean // Phase 3: Abort heartbeat if idle > maxAgeMinutes
      injectIntoPrompt: boolean // Phase 4: Send the raw "idle time" data to the LLM
      maxAgeMinutes: number
    }
    mouse: {
      useAsLocalGate: boolean
      injectIntoPrompt: boolean
      maxAgeMinutes: number
    }
    activeWindow: {
      useAsLocalGate: boolean // Phase 3: Only trigger if window matches an allowed list (future feature)
      injectIntoPrompt: boolean // Phase 4: Send the active window title to the LLM (Privacy Warning!)
    }
    chatHistory: {
      injectIntoPrompt: boolean // Phase 4: Pass last N messages to the LLM
      maxMessages: number
    }
    time: {
      injectIntoPrompt: boolean // Phase 1: Send local time and timezone to the LLM
    }
  }
}
```

---

## 4. The Architecture & Flow (Pipeline)

The Heartbeat pipeline executes in 5 distinct phases every time the internal interval timer ticks.

### Phase 1: The Timer & Hard Gates (The "Tick")
1. The system runs a background interval (e.g., checks every 1 minute).
2. It checks if `intervalMinutes` (e.g., 30) have passed since the last interaction (user message OR last heartbeat).
3. It checks the **Schedule**. If the current time is `02:00` and the schedule is `09:00-23:00`, the heartbeat is immediately aborted.

### Phase 2: Sensor Polling (Activity Loggers)
If the Hard Gates pass, the system polls the OS level sensors (via Electron's main process):
*   **Idle Time**: How long since the last keyboard/mouse input?
*   **Foreground Window**: What is the title of the active application? (e.g., `Discord - General`, `Microsoft Teams`, `Elden Ring`).

### Phase 3: Heuristic Gates (The "Are you there?" Check)
The system checks the sensor data against the user's configuration.
*   *Example*: If `Keyboard Activity` is checked and set to `< 2 mins`, but the PC has been idle for 60 minutes, **Abort Heartbeat**. We don't want the AI talking to an empty room.

### Phase 4: Contextual Prompt Formulation
If the user is active, we construct a hidden, specialized system prompt that injects the real-time context.

**Constructed Prompt Structure:**
> `[SYSTEM]`
> This is a proactive heartbeat event. The user did not speak to you, you are deciding whether to speak to them based on their current activity.
>
> `[CURRENT CONTEXT]`
> Current Time: 14:30 (EDT)
> Keyboard Active: 2 minutes ago
> Mouse Active: 30 seconds ago
> Active Window: "Brave Browser (Discord)"
>
> `[RECENT CONVERSATION]`
> User: I'm feeling a bit tired today.
> Assistant: I'm sorry to hear that. Have you taken any breaks recently?
>
> `[HEARTBEAT INSTRUCTIONS]`
> {user.heartbeatConfig.systemPrompt}
> *(e.g., "Ask me how I'm doing and offer to make me a pic. If my active window is Microsoft Teams or Google Chats then don't bother me.")*
>
> `[FINAL RULE]`
> Analyze the context. If you decide to speak, output the text you wish to say. If you decide you should NOT interrupt the user right now, output exactly the string: "NO_REPLY".

### Phase 5: LLM Execution & TTS Dispatch
1. The LLM processes the prompt.
2. The system intercepts the response.
3. **If response is `NO_REPLY` (or equivalent)**: The system logs a successful check, but takes no action. The interval timer resets.
4. **If response is conversational**:
   * The text is added to the Chat History.
   * The text is routed down the standard pipeline to trigger the TTS Engine.
   * The TTS audio plays, accompanied by Live2D/3D lip-sync and expressions.

---

## 5. Technical Requirements & Challenges
*   **Electron OS APIs**: We need native node modules (like `active-win` or `desktop-idle`) integrated into the Electron main process to capture active window titles and global idle times across Windows/macOS/Linux securely.
*   **Prompt Engineering**: The exact phrasing of the `[FINAL RULE]` is critical. LLMs are notoriously chatty, and we must ensure it reliably outputs *only* `NO_REPLY` when it shouldn't speak, rather than "Okay, I will output NO_REPLY as you requested."
*   **State Management**: The chat history needs a way to separate "user-initiated messages", "assistant proactive messages", and "silent aborted heartbeats" to avoid corrupting the conversational flow with empty blocks.

---

## 6. Implementation Phases (Strategic Roadmap)

To avoid "putting the cart before the horse" with overly complex, generalized memory requirements, the Heartbeats system will be implemented iteratively via specific, goal-driven phases.

### Phase 1: The Stateless MVP (Focus: Core Proactivity)
The primary goal is to establish the timing, OS-level sensing, and basic proactive prompt injection without relying on any historical chat data.
*   Implement the Interval Timer and Schedule controls.
*   Build the Electron bindings for Idle Time (Keyboard/Mouse) and Foreground Window sensing.
*   Implement the `useAsLocalGate` (Phase 3) and `injectIntoPrompt` (Phase 4) logic for these sensors.
*   *Requirement*: The `chatHistory` context injection is **DISABLED or omitted entirely** in this phase. The LLM relies purely on the current contextual moment and the predefined system prompt ("Hey, I see you are playing Elden Ring...").

### Phase 2: Short-Term Memory Integration (Focus: Contextual Continuity)
Once the stateless engine is robust, memory is integrated to make the Heartbeats feel conversational rather than random.
*   Solidify the core Chat History persistence layer (ensuring conversations survive app reloads/closures).
*   Implement the `chatHistory.injectIntoPrompt` setting.
*   Inject the `[RECENT CONVERSATION]` (e.g., last 5 messages) block into the Heartbeat prompt.
*   Allow the LLM to weave its proactive checking ("How are you doing?") cleanly into the ongoing thread.

### Phase 3: Long-Term Memory & Agentic Autonomy (Focus: The Future)
With a robust short-term proactive engine running, the system can expand towards a generalized autonomous loop.
*   **Semantic Memory / Journaling**: Allow the heartbeat prompt to query a vector database ("When did the user last mention feeling stressed?") before deciding to speak.
*   **Tool Calling on Wake**: When the Heartbeat triggers, give the LLM access to external tools (e.g., fetch weather, read calendar) before formatting its final output payload to the TTS engine.
