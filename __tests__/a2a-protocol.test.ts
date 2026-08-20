/**
 * A2A protocol round-trip — vitest.
 *
 * Boots a real `startA2AServer` on an ephemeral port and drives it with the
 * real `client.ts` functions (no mocking of `fetch` or `http`), so this
 * guards the actual wire shapes agreed between client and server, not just
 * each side's internal logic in isolation.
 */

import { describe, it, expect, afterEach } from "vitest";
import { startA2AServer, type A2AServerHandle } from "../src/services/a2a/server.js";
import { buildAgentCard } from "../src/services/a2a/registry.js";
import {
  getAgentCard,
  sendMessage,
  getTask,
  cancelTask,
  pollTaskUntilTerminal,
} from "../src/services/a2a/client.js";
import { A2AError } from "../src/services/a2a/types.js";
import { AGENT_DEFS } from "../src/init/claude-agents.js";

let handle: A2AServerHandle | undefined;

afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

async function startEcho(opts?: {
  authToken?: string;
  delayMs?: number;
  fail?: boolean;
  agents?: typeof AGENT_DEFS;
}) {
  handle = await startA2AServer({
    buildAgentCard: (url) => buildAgentCard({ url, agents: opts?.agents ?? AGENT_DEFS }),
    authToken: opts?.authToken,
    executor: async ({ skillId, message }) => {
      if (opts?.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts?.fail) throw new Error("executor exploded");
      const text = message.parts.find((p): p is { text: string } => "text" in p)?.text ?? "";
      return [{ text: `echo(${skillId ?? "default"}): ${text}` }];
    },
  });
  return handle;
}

describe("A2A server + client round-trip", () => {
  it("serves an Agent Card with all 8 aiyou-team skills", async () => {
    const { url } = await startEcho();
    const card = await getAgentCard(url);

    expect(card.name).toBe("aiyou-team");
    expect(card.skills.map((s) => s.id).sort()).toEqual(
      AGENT_DEFS.map((d) => d.name).sort()
    );
    expect(card.supportedInterfaces[0]?.url).toBe(url);
    expect(card.supportedInterfaces[0]?.protocolBinding).toBe("HTTP+JSON");
  });

  it("message:send returns a completed task carrying the executor's reply", async () => {
    const { url } = await startEcho();
    const task = await sendMessage(url, { text: "hello", skillId: "coding-leader" });

    expect(task.status.state).toBe("TASK_STATE_COMPLETED");
    expect(task.status.message?.role).toBe("ROLE_AGENT");
    expect(task.status.message?.parts[0]).toMatchObject({ text: "echo(coding-leader): hello" });
    expect(task.history?.length).toBe(2); // user message + agent reply
  });

  it("tasks/{id} returns the same task by id after message:send", async () => {
    const { url } = await startEcho();
    const sent = await sendMessage(url, { text: "ping", skillId: "reviewer" });
    const fetched = await getTask(url, sent.id);

    expect(fetched.id).toBe(sent.id);
    expect(fetched.status.state).toBe("TASK_STATE_COMPLETED");
  });

  it("getTask 404s for an unknown id", async () => {
    const { url } = await startEcho();
    await expect(getTask(url, "does-not-exist")).rejects.toMatchObject({ status: 404 });
  });

  it("marks the task failed (not a thrown request) when the executor throws", async () => {
    const { url } = await startEcho({ fail: true });
    const task = await sendMessage(url, { text: "boom", skillId: "reviewer" });

    expect(task.status.state).toBe("TASK_STATE_FAILED");
    expect(task.status.message?.parts[0]).toMatchObject({ text: "executor exploded" });
  });

  it("pollTaskUntilTerminal waits out a slow executor", async () => {
    const { url } = await startEcho({ delayMs: 50 });
    // sendMessage already awaits completion server-side (no async worker queue
    // yet), so by the time it resolves the task is already terminal — polling
    // an already-terminal task should return immediately on the first check.
    const sent = await sendMessage(url, { text: "slow", skillId: "reviewer" });
    const task = await pollTaskUntilTerminal(url, sent.id, { intervalMs: 10, timeoutMs: 2000 });

    expect(task.status.state).toBe("TASK_STATE_COMPLETED");
  });

  it("tasks/{id}:cancel marks a terminal task canceled only when not already terminal", async () => {
    const { url } = await startEcho();
    const sent = await sendMessage(url, { text: "x", skillId: "reviewer" });
    // Already TASK_STATE_COMPLETED by the time message:send resolves — cancel
    // must be a no-op on a terminal task, not force it back to CANCELED.
    const canceled = await cancelTask(url, sent.id);
    expect(canceled.status.state).toBe("TASK_STATE_COMPLETED");
  });

  it("rejects requests without the configured bearer token", async () => {
    const { url } = await startEcho({ authToken: "secret" });

    await expect(sendMessage(url, { text: "hi" })).rejects.toMatchObject({ status: 401 });

    const task = await sendMessage(url, { text: "hi", skillId: "reviewer" }, { authToken: "secret" });
    expect(task.status.state).toBe("TASK_STATE_COMPLETED");
  });

  it("always serves the Agent Card unauthenticated, even when a token is configured", async () => {
    const { url } = await startEcho({ authToken: "secret" });
    const card = await getAgentCard(url);
    expect(card.name).toBe("aiyou-team");
  });

  it("rejects a message with no parts", async () => {
    const { url } = await startEcho();
    await expect(
      fetch(`${url}/message:send`, {
        method: "POST",
        body: JSON.stringify({ message: { messageId: "m1", role: "ROLE_USER", parts: [] } }),
      })
    ).resolves.toMatchObject({ status: 400 });
  });

  it("A2AError carries the server-reported status and code", async () => {
    const { url } = await startEcho();
    try {
      await getTask(url, "missing");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(A2AError);
      expect((err as A2AError).status).toBe(404);
      expect((err as A2AError).code).toBe("NOT_FOUND");
    }
  });

  // ── Skill authorization (security review finding, plan Fase 3) ────
  //
  // `--agent <name>` filtering only the Agent Card's advertised skills — with
  // no server-side check that the requested `skillId` is actually one of
  // them — let any caller with the (whole-server) auth token request a more
  // privileged agent than the operator intended to expose. Regression tests
  // for the fix (resolveSkillId() in server.ts).

  describe("skill authorization", () => {
    it("rejects a skillId the server doesn't publish, even with valid auth", async () => {
      const restricted = AGENT_DEFS.filter((d) => d.name === "codebase-explorer");
      const { url } = await startEcho({ agents: restricted, authToken: "tok" });

      await expect(
        sendMessage(url, { text: "hi", skillId: "coding-leader" }, { authToken: "tok" })
      ).rejects.toMatchObject({ status: 403 });
    });

    it("does not create a task for a rejected skillId", async () => {
      const restricted = AGENT_DEFS.filter((d) => d.name === "codebase-explorer");
      const { url } = await startEcho({ agents: restricted });

      await expect(sendMessage(url, { text: "hi", skillId: "coding-leader" })).rejects.toMatchObject({ status: 403 });
      // No task id was ever returned, so there's nothing to assert against
      // tasks/{id} directly — the meaningful assertion is that the rejected
      // request never reached the executor (see next test).
    });

    it("never invokes the executor for a rejected skillId", async () => {
      let invoked = false;
      const restricted = AGENT_DEFS.filter((d) => d.name === "codebase-explorer");
      handle = await startA2AServer({
        buildAgentCard: (url) => buildAgentCard({ url, agents: restricted }),
        executor: async () => {
          invoked = true;
          return [{ text: "should not run" }];
        },
      });

      await expect(sendMessage(handle.url, { text: "hi", skillId: "coding-leader" })).rejects.toMatchObject({ status: 403 });
      expect(invoked).toBe(false);
    });

    it("accepts a published skillId", async () => {
      const restricted = AGENT_DEFS.filter((d) => d.name === "codebase-explorer");
      const { url } = await startEcho({ agents: restricted });

      const task = await sendMessage(url, { text: "hi", skillId: "codebase-explorer" });
      expect(task.status.state).toBe("TASK_STATE_COMPLETED");
    });

    it("auto-selects the only published skill when skillId is omitted", async () => {
      const restricted = AGENT_DEFS.filter((d) => d.name === "reviewer");
      const { url } = await startEcho({ agents: restricted });

      const task = await sendMessage(url, { text: "hi" }); // no skillId
      expect(task.status.state).toBe("TASK_STATE_COMPLETED");
      expect(task.status.message?.parts[0]).toMatchObject({ text: "echo(reviewer): hi" });
    });

    it("requires an explicit skillId when multiple skills are published", async () => {
      const { url } = await startEcho(); // all 8 agents published
      await expect(sendMessage(url, { text: "hi" })).rejects.toMatchObject({ status: 400 });
    });

    it("rejects any skillId when the server publishes no skills", async () => {
      const { url } = await startEcho({ agents: [] });
      await expect(sendMessage(url, { text: "hi" })).rejects.toMatchObject({ status: 400 });
      await expect(sendMessage(url, { text: "hi", skillId: "reviewer" })).rejects.toMatchObject({ status: 403 });
    });
  });
});
