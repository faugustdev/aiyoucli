/**
 * A2A (Agent2Agent) protocol types — hand-rolled from the `lf.a2a.v1` proto
 * in `specification/a2a.proto` at github.com/a2aproject/A2A (the repo
 * `faugustdev/A2A` forks with 0 diverged commits). No dependency on the A2A
 * SDKs — aiyoucli has zero runtime dependencies and this covers only the
 * subset the CLI needs.
 *
 * Wire format is the `HTTP+JSON` binding (`AgentInterface.protocol_binding`),
 * i.e. proto3 JSON encoding of these same messages served over plain REST
 * (`POST /message:send`, `GET /tasks/{id}`, `POST /tasks/{id}:cancel`) rather
 * than the JSON-RPC 2.0 or gRPC bindings the spec also allows. That means:
 *   - field names are camelCase (proto3 JSON default)
 *   - enums serialize as their full string name (e.g. "TASK_STATE_COMPLETED",
 *     "ROLE_USER") — NOT the lowercase short forms ("completed", "user")
 *     used by some older, pre-protobuf A2A JSON schemas. If interop testing
 *     against a real-world A2A server shows it expects the short forms, this
 *     is the file to adjust.
 *
 * Non-goals for this minimal implementation (see plan: sleepy-singing-lobster):
 *   - streaming (`message:stream`, `tasks/{id}:subscribe`) — SSE, not implemented
 *   - push notification configs
 *   - `ListTasks`, `GetExtendedAgentCard`
 *   - file parts (`raw`/`url` Part variants) — text and data parts only
 *   - advanced security schemes (OAuth2/OIDC/mTLS) — bearer-token auth only
 */

// ── Task lifecycle ──────────────────────────────────────────────

export type TaskState =
  | "TASK_STATE_UNSPECIFIED"
  | "TASK_STATE_SUBMITTED"
  | "TASK_STATE_WORKING"
  | "TASK_STATE_COMPLETED"
  | "TASK_STATE_FAILED"
  | "TASK_STATE_CANCELED"
  | "TASK_STATE_INPUT_REQUIRED"
  | "TASK_STATE_REJECTED"
  | "TASK_STATE_AUTH_REQUIRED";

export const TERMINAL_TASK_STATES: ReadonlySet<TaskState> = new Set([
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_REJECTED",
]);

export type Role = "ROLE_UNSPECIFIED" | "ROLE_USER" | "ROLE_AGENT";

// ── Message / Part ──────────────────────────────────────────────

/** Text or structured-data content only — file parts (`raw`/`url`) are a non-goal. */
export type Part =
  | { text: string; metadata?: Record<string, unknown>; filename?: string; mediaType?: string }
  | { data: unknown; metadata?: Record<string, unknown>; filename?: string; mediaType?: string };

export interface Message {
  messageId: string;
  contextId?: string;
  taskId?: string;
  role: Role;
  parts: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
  referenceTaskIds?: string[];
}

// ── Task ─────────────────────────────────────────────────────────

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  /** ISO 8601 timestamp. */
  timestamp?: string;
}

export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
}

export interface Task {
  id: string;
  contextId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: Message[];
  metadata?: Record<string, unknown>;
}

// ── Agent Card ───────────────────────────────────────────────────

export interface AgentInterface {
  url: string;
  /** "JSONRPC" | "GRPC" | "HTTP+JSON" — this implementation always emits "HTTP+JSON". */
  protocolBinding: string;
  tenant?: string;
  protocolVersion: string;
}

export interface AgentProvider {
  url: string;
  organization: string;
}

export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  extendedAgentCard?: boolean;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface AgentCard {
  name: string;
  description: string;
  supportedInterfaces: AgentInterface[];
  provider?: AgentProvider;
  version: string;
  documentationUrl?: string;
  capabilities: AgentCapabilities;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
  iconUrl?: string;
}

// ── message:send request/response ───────────────────────────────

export interface SendMessageConfiguration {
  acceptedOutputModes?: string[];
  historyLength?: number;
  /** Default `false`: wait for a terminal/interrupted state before responding. */
  returnImmediately?: boolean;
}

export interface SendMessageRequest {
  message: Message;
  configuration?: SendMessageConfiguration;
  metadata?: Record<string, unknown>;
}

/** The spec allows a bare `message` response too; this server always returns a `task`. */
export interface SendMessageResponse {
  task?: Task;
  message?: Message;
}

// ── Errors ───────────────────────────────────────────────────────

export class A2AError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string
  ) {
    super(message);
    this.name = "A2AError";
  }
}
