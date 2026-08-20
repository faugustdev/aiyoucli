/**
 * opencode-headless executor — vitest.
 *
 * Doesn't talk to a real `opencode serve` (needs a real project + model
 * credentials). Instead stubs `fetch` against the exact request shapes this
 * executor makes, confirmed against a real server's `/doc` OpenAPI schema
 * during the Fase 3 OpenCode spike — see opencode-headless.ts's header for
 * what was verified live and why the design looks like this.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createOpenCodeHeadlessExecutor,
  resolveCanonicalAgentId,
} from "../src/services/a2a/executors/opencode-headless.js";
import type { Message, Task } from "../src/services/a2a/types.js";

const AGENTS = [
  { name: "coding-leader", mode: "primary" },
  { name: "coding-codebase-explorer", mode: "subagent" },
  { name: "coding-reviewer", mode: "subagent" },
];

function userMessage(text: string, skillId?: string): Message {
  return { messageId: "m1", role: "ROLE_USER", parts: [{ text }], metadata: skillId ? { skillId } : undefined };
}

const dummyTask: Task = { id: "t1", contextId: "c1", status: { state: "TASK_STATE_WORKING" } };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe("resolveCanonicalAgentId", () => {
  it("matches an exact name (unprefixed agents like coding-leader)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AGENTS));
    const id = await resolveCanonicalAgentId("coding-leader", { serverUrl: "http://x" });
    expect(id).toBe("coding-leader");
  });

  it("matches a team-stem-prefixed name via suffix (codebase-explorer -> coding-codebase-explorer)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AGENTS));
    const id = await resolveCanonicalAgentId("codebase-explorer", { serverUrl: "http://x" });
    expect(id).toBe("coding-codebase-explorer");
  });

  it("throws with a clear message when no agent matches", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AGENTS));
    await expect(resolveCanonicalAgentId("nonexistent-agent", { serverUrl: "http://x" })).rejects.toThrow(
      /No OpenCode agent registered for skill "nonexistent-agent"/
    );
  });

  it("requests GET /agent", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AGENTS));
    await resolveCanonicalAgentId("coding-leader", { serverUrl: "http://x" });
    expect(fetchMock).toHaveBeenCalledWith("http://x/agent", expect.objectContaining({ method: "GET" }));
  });
});

describe("createOpenCodeHeadlessExecutor", () => {
  it("requires skillId", async () => {
    const executor = createOpenCodeHeadlessExecutor({ serverUrl: "http://x" });
    await expect(executor({ message: userMessage("hi"), task: dummyTask })).rejects.toThrow(/skillId/);
  });

  it("creates a session, prompts it with the resolved agent, and deletes the session", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(AGENTS)) // GET /agent
      .mockResolvedValueOnce(jsonResponse({ id: "ses_123" })) // POST /session
      .mockResolvedValueOnce(
        jsonResponse({
          info: { agent: "coding-reviewer" },
          parts: [{ type: "text", text: "looks good" }],
        })
      ) // POST /session/ses_123/message
      .mockResolvedValueOnce(jsonResponse({})); // DELETE /session/ses_123

    const executor = createOpenCodeHeadlessExecutor({ serverUrl: "http://x" });
    const parts = await executor({
      skillId: "reviewer",
      message: userMessage("review this", "reviewer"),
      task: dummyTask,
    });

    expect(parts).toEqual([{ text: "looks good" }]);

    const [, sessionCreateCall, promptCall, deleteCall] = fetchMock.mock.calls;
    expect(sessionCreateCall[0]).toBe("http://x/session");
    expect(promptCall[0]).toBe("http://x/session/ses_123/message");
    expect(JSON.parse(promptCall[1].body)).toMatchObject({
      agent: "coding-reviewer",
      parts: [{ type: "text", text: "review this" }],
    });
    expect(deleteCall[0]).toBe("http://x/session/ses_123");
    expect(deleteCall[1]).toMatchObject({ method: "DELETE" });
  });

  it("still deletes the session when the prompt call fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(AGENTS))
      .mockResolvedValueOnce(jsonResponse({ id: "ses_456" }))
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, false, 500))
      .mockResolvedValueOnce(jsonResponse({}));

    const executor = createOpenCodeHeadlessExecutor({ serverUrl: "http://x" });
    await expect(
      executor({ skillId: "reviewer", message: userMessage("hi", "reviewer"), task: dummyTask })
    ).rejects.toThrow(/HTTP 500/);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][0]).toBe("http://x/session/ses_456");
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: "DELETE" });
  });

  it("sends HTTP Basic auth when a password is configured", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(AGENTS))
      .mockResolvedValueOnce(jsonResponse({ id: "ses_789" }))
      .mockResolvedValueOnce(jsonResponse({ info: {}, parts: [{ type: "text", text: "ok" }] }))
      .mockResolvedValueOnce(jsonResponse({}));

    const executor = createOpenCodeHeadlessExecutor({ serverUrl: "http://x", password: "sekret" });
    await executor({ skillId: "reviewer", message: userMessage("hi", "reviewer"), task: dummyTask });

    const expectedAuth = `Basic ${Buffer.from("opencode:sekret").toString("base64")}`;
    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers.authorization).toBe(expectedAuth);
    }
  });

  it("joins multiple text parts from the reply with blank lines", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(AGENTS))
      .mockResolvedValueOnce(jsonResponse({ id: "ses_1" }))
      .mockResolvedValueOnce(
        jsonResponse({
          info: {},
          parts: [
            { type: "step-start" },
            { type: "text", text: "part one" },
            { type: "text", text: "part two" },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({}));

    const executor = createOpenCodeHeadlessExecutor({ serverUrl: "http://x" });
    const parts = await executor({ skillId: "reviewer", message: userMessage("hi", "reviewer"), task: dummyTask });
    expect(parts).toEqual([{ text: "part one\n\npart two" }]);
  });
});
