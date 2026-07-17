/**
 * Phase 4 verify tests — vitest.
 *
 * Tests cover:
 *   - Each individual probe (system_doctor, capabilities, coordination, memory)
 *   - Probe happy path, error path, edge cases
 *   - Report aggregation (clean, hasFailures, summary)
 *   - Parallel execution safety (all probes run even if one fails)
 *
 * The ToolCaller dependency is injected so tests don't need a real MCP
 * server or NAPI binary.
 */

import { describe, it, expect, vi } from "vitest";
import { runVerification, type ToolCaller, type VerifyReport } from "../src/init/verify.js";
import { runWireValidation } from "../src/init/wire-validate.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeStub(
  responses: Record<string, { ok: boolean; text: string; isError?: boolean }>
): ToolCaller {
  return async (name: string) => {
    const r = responses[name];
    if (!r) {
      return { ok: false, text: `unknown tool: ${name}`, isError: true };
    }
    return r;
  };
}

function makeDoctorResponse(healthy: boolean, checks: Array<{ name: string; status: string }>) {
  return {
    ok: true,
    text: JSON.stringify({
      healthy,
      checks: checks.map((c) => ({ name: c.name, status: c.status, detail: "" })),
    }),
  };
}

function makeCapabilitiesResponse(opts: {
  napi?: boolean;
  teamAvailable?: boolean;
  teamVersion?: string;
  embedRunning?: boolean;
}) {
  return {
    ok: true,
    text: JSON.stringify({
      napi: {
        available: opts.napi ?? true,
        binary: "aiyoucli-napi",
        features: ["vector_db", "sona_learning", "knowledge_graph"],
      },
      aiyou_team: {
        available: opts.teamAvailable ?? true,
        version: opts.teamVersion ?? "0.1.8",
        via: "npx",
      },
      embed_server: {
        running: opts.embedRunning ?? false,
        port: 8001,
      },
    }),
  };
}

function makeCoordinationResponse(opts: {
  swarmActive?: boolean;
  topology?: string;
  agentCount?: number;
  taskCount?: number;
}) {
  return {
    ok: true,
    text: JSON.stringify({
      swarm: {
        active: opts.swarmActive ?? true,
        topology: opts.topology ?? "hierarchical",
        agentCount: opts.agentCount ?? 3,
      },
      agents: { total: opts.agentCount ?? 3, active: opts.agentCount ?? 3 },
      tasks: { total: opts.taskCount ?? 0, running: 0, done: 0 },
    }),
  };
}

function makeMemoryResponse(count: number) {
  return {
    ok: true,
    text: `Vectors: ${count}`,
  };
}

describe("runVerification", () => {
  describe("system_doctor probe", () => {
    it("reports ok when doctor returns healthy", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [
          { name: "node", status: "ok" },
          { name: "napi", status: "ok" },
          { name: "git", status: "ok" },
        ]),
        capabilities: makeCapabilitiesResponse({}),
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(100),
      });

      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const row = report.rows.find((r) => r.name === "Doctor");
      expect(row).toBeDefined();
      expect(row!.status).toBe("ok");
      expect(row!.detail).toContain("3/3");
    });

    it("reports degraded when doctor returns unhealthy", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(false, [
          { name: "node", status: "ok" },
          { name: "napi", status: "fail" },
        ]),
        capabilities: makeCapabilitiesResponse({}),
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(0),
      });

      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const row = report.rows.find((r) => r.name === "Doctor");
      expect(row!.status).toBe("degraded");
      expect(row!.suggestion).toContain("aiyoucli doctor");
    });

    it("reports failed when tool returns error", async () => {
      const stub = makeStub({
        system_doctor: { ok: false, text: "napi binary missing", isError: true },
        capabilities: makeCapabilitiesResponse({}),
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(0),
      });

      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const row = report.rows.find((r) => r.name === "Doctor");
      expect(row!.status).toBe("failed");
    });
  });

  describe("capabilities probe (3 sub-rows)", () => {
    it("produces NAPI, aiyou-team, and Embed Server rows", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({
          napi: true,
          teamAvailable: true,
          embedRunning: true,
        }),
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(0),
      });

      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const names = report.rows.map((r) => r.name);
      expect(names).toContain("NAPI");
      expect(names).toContain("aiyou-team");
      expect(names).toContain("Embed Server");
    });

    it("NAPI row reflects availability", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({ napi: false }),
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(0),
      });

      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const napi = report.rows.find((r) => r.name === "NAPI")!;
      expect(napi.status).toBe("failed");
      expect(napi.suggestion).toContain("build:rs");
    });

    it("aiyou-team row reflects availability", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({ teamAvailable: false }),
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(0),
      });

      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const team = report.rows.find((r) => r.name === "aiyou-team")!;
      expect(team.status).toBe("degraded");
    });

    it("Embed Server row is always in_development (per project policy)", async () => {
      const stubRunning = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({ embedRunning: true }),
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(0),
      });
      const report1 = await runVerification({ cwd: "/tmp", callTool: stubRunning });
      const embed1 = report1.rows.find((r) => r.name === "Embed Server")!;
      expect(embed1.status).toBe("in_development");

      const stubStopped = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({ embedRunning: false }),
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(0),
      });
      const report2 = await runVerification({ cwd: "/tmp", callTool: stubStopped });
      const embed2 = report2.rows.find((r) => r.name === "Embed Server")!;
      expect(embed2.status).toBe("in_development");
    });

    it("capabilities probe does not crash on malformed JSON", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: { ok: true, text: "not json" },
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(0),
      });

      // Should not throw — probe handles parse failure by emitting a degraded row.
      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const napi = report.rows.find((r) => r.name === "NAPI")!;
      expect(["degraded", "failed"]).toContain(napi.status);
    });
  });

  describe("coordination probe", () => {
    it("reports ok when swarm is active with agents", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({}),
        status: makeCoordinationResponse({ swarmActive: true, agentCount: 3 }),
        memory_count: makeMemoryResponse(0),
      });
      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const row = report.rows.find((r) => r.name === "Coordination")!;
      expect(row.status).toBe("ok");
      expect(row.detail).toContain("3 agents");
    });

    it("reports degraded when swarm is not active", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({}),
        status: makeCoordinationResponse({ swarmActive: false }),
        memory_count: makeMemoryResponse(0),
      });
      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const row = report.rows.find((r) => r.name === "Coordination")!;
      expect(row.status).toBe("degraded");
      expect(row.suggestion).toContain("warmup");
    });
  });

  describe("memory probe", () => {
    it("reports ok with count when vectors exist", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({}),
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(1247),
      });
      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const row = report.rows.find((r) => r.name === "Memory")!;
      expect(row.status).toBe("ok");
      expect(row.detail).toContain("1247");
      expect(row.detail).toContain("HNSW");
    });

    it("reports degraded when memory is empty", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({}),
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(0),
      });
      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const row = report.rows.find((r) => r.name === "Memory")!;
      expect(row.status).toBe("degraded");
      expect(row.detail).toContain("empty");
    });

    it("reports failed when tool errors", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({}),
        status: makeCoordinationResponse({}),
        memory_count: { ok: false, text: "napi unavailable", isError: true },
      });
      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      const row = report.rows.find((r) => r.name === "Memory")!;
      expect(row.status).toBe("failed");
      expect(row.suggestion).toContain("memory_init");
    });
  });

  describe("parallel execution and aggregation", () => {
    it("runs all probes even when one fails", async () => {
      const stub = makeStub({
        system_doctor: { ok: false, text: "boom", isError: true },
        capabilities: makeCapabilitiesResponse({}),
        status: makeCoordinationResponse({}),
        memory_count: makeMemoryResponse(0),
      });
      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      // We expect: Doctor (failed) + 3 capability rows + Coordination + Memory = 6
      expect(report.rows.length).toBeGreaterThanOrEqual(6);
      expect(report.hasFailures).toBe(true);
      expect(report.clean).toBe(false);
    });

    it("clean is true when everything is ok or in_development", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({ embedRunning: false }),
        status: makeCoordinationResponse({ swarmActive: true, agentCount: 2 }),
        memory_count: makeMemoryResponse(50),
      });
      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      // embed will be in_development; everything else should be ok
      expect(report.clean).toBe(true);
      expect(report.hasFailures).toBe(false);
    });

    it("summary contains counts", async () => {
      const stub = makeStub({
        system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
        capabilities: makeCapabilitiesResponse({ embedRunning: false }),
        status: makeCoordinationResponse({ swarmActive: true, agentCount: 1 }),
        memory_count: makeMemoryResponse(10),
      });
      const report = await runVerification({ cwd: "/tmp", callTool: stub });
      expect(report.summary).toMatch(/ok/);
      expect(report.summary).toMatch(/in dev/);
    });
  });
});

describe("renderInitSummary", () => {
  it("renders without throwing on a typical report", async () => {
    const stub = makeStub({
      system_doctor: makeDoctorResponse(true, [{ name: "node", status: "ok" }]),
      capabilities: makeCapabilitiesResponse({ embedRunning: false }),
      status: makeCoordinationResponse({ swarmActive: true, agentCount: 2 }),
      memory_count: makeMemoryResponse(50),
    });

    const tmpDir = mkdtempSync(join(tmpdir(), "aiyoucli-verify-"));
    try {
      const wire = runWireValidation({ cwd: tmpDir });
      const verify = await runVerification({ cwd: tmpDir, callTool: stub });
      // Import the renderer; pass-through (it uses console.log internally).
      const { renderInitSummary } = await import("../src/init/verify.js");
      // Should not throw
      expect(() => renderInitSummary(wire, verify)).not.toThrow();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
