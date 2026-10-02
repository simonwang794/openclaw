// Subagent delivery-state tests cover current registry record normalization.
import { describe, expect, it } from "vitest";
import {
  normalizeSubagentRunState,
  resolveSubagentReturnLifecycle,
} from "./subagent-delivery-state.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

function baseRun(overrides: Partial<SubagentRunRecord> = {}): SubagentRunRecord {
  return {
    runId: "run-1",
    childSessionKey: "agent:main:subagent:child",
    requesterSessionKey: "agent:main:parent",
    requesterDisplayKey: "agent:main:parent",
    controllerSessionKey: "agent:main:parent",
    task: "inspect",
    cleanup: "keep",
    spawnMode: "run",
    createdAt: 100,
    expectsCompletionMessage: true,
    execution: { status: "running", startedAt: 100 },
    completion: { required: true },
    delivery: { status: "pending" },
    ...overrides,
  };
}

describe("birth-bound return lifecycle", () => {
  const metadata = {
    origin: { sessionKey: "agent:main:parent", sessionId: "birth-session" },
    originator: { status: "unknown" as const },
    responsibleOwner: { agentId: "main" },
    returnChannel: {
      kind: "requester_session" as const,
      sessionKey: "agent:main:parent",
      sessionId: "birth-session",
    },
    workId: "run-1",
    scope: "inspect",
    authorizationBoundary: "requester_session_only" as const,
    acceptanceConditions: { status: "unknown" as const },
    requiredEvidence: "exact_target_visible_readback" as const,
    completed: [],
    remaining: ["result_delivery"],
    unknown: ["originator", "acceptance_conditions"],
    blocked: [],
  };

  it("never treats a send-only receipt or wrong-session readback as delivered", () => {
    const entry = baseRun({
      returnMetadata: metadata,
      completionRequesterSessionId: "birth-session",
    });
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RUNNING");
    entry.execution.status = "terminal";
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RESULT_READY");
    entry.delivery!.status = "in_progress";
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RETURNING");
    entry.delivery!.status = "delivered";
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RETURN_BLOCKED");
    entry.delivery!.targetVisibleAck = {
      sessionKey: "agent:main:parent",
      sessionId: "replacement-session",
      messageId: "msg-1",
      observedAt: 200,
      source: "provider_readback",
    };
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RETURN_BLOCKED");
    entry.delivery!.targetVisibleAck.sessionId = "birth-session";
    expect(resolveSubagentReturnLifecycle(entry)).toBe("DELIVERED");
    entry.cleanupCompletedAt = 250;
    expect(resolveSubagentReturnLifecycle(entry)).toBe("CLOSED");
  });

  it("requires provider readback before an external return is delivered", () => {
    const entry = baseRun({
      returnMetadata: {
        ...metadata,
        returnChannel: { ...metadata.returnChannel, route: { channel: "discord", to: "chat-1" } },
      },
      completionRequesterSessionId: "birth-session",
      execution: { status: "terminal" },
      delivery: {
        status: "delivered",
        providerReceipt: { channel: "discord", to: "chat-1", messageId: "provider-1" },
        verification: { readback: "unsupported" },
      },
    });
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RETURN_BLOCKED");
    expect(entry.delivery?.targetVisibleAck).toBeUndefined();
    expect(entry.delivery?.verification?.readback).toBe("unsupported");
    entry.delivery!.verification = { readback: "passed" };
    expect(resolveSubagentReturnLifecycle(entry)).toBe("DELIVERED");
    entry.delivery!.verification = { readback: "failed" };
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RETURN_BLOCKED");
  });

  it("blocks failed or unidentifiable external sends and wrong routes", () => {
    const entry = baseRun({
      returnMetadata: {
        ...metadata,
        returnChannel: { ...metadata.returnChannel, route: { channel: "telegram", to: "chat-1" } },
      },
      completionRequesterSessionId: "birth-session",
      execution: { status: "terminal" },
      delivery: { status: "failed" },
    });
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RETURN_BLOCKED");
    entry.delivery!.status = "delivered";
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RETURN_BLOCKED");
    entry.delivery!.providerReceipt = { channel: "telegram", to: "wrong", messageId: "provider-1" };
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RETURN_BLOCKED");
    entry.delivery!.providerReceipt.to = "chat-1";
    entry.delivery!.providerReceipt.messageId = "ok";
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RETURN_BLOCKED");
  });

  it("keeps legacy records without birth binding unverified", () => {
    const entry = baseRun({ execution: { status: "terminal" }, delivery: { status: "delivered" } });
    expect(resolveSubagentReturnLifecycle(entry)).toBe("RETURN_BLOCKED");
  });
});

describe("normalizeSubagentRunState", () => {
  it("normalizes durable task ownership and generation metadata", () => {
    const entry = normalizeSubagentRunState(
      baseRun({ taskRunId: "  run-task-owner  ", generation: 2 }),
    );
    const malformed = normalizeSubagentRunState(
      baseRun({ taskRunId: "   ", generation: Number.NaN }),
    );
    const nonString = normalizeSubagentRunState({
      ...baseRun(),
      taskRunId: 42,
    } as unknown as SubagentRunRecord);

    expect(entry).toMatchObject({ taskRunId: "run-task-owner", generation: 2 });
    expect(malformed.taskRunId).toBeUndefined();
    expect(malformed.generation).toBeUndefined();
    expect(nonString.taskRunId).toBeUndefined();
  });

  it("normalizes the durable delete-dispatch boundary", () => {
    const valid = normalizeSubagentRunState(baseRun({ deleteCleanupDispatchedAt: 200 }));
    const malformed = normalizeSubagentRunState(baseRun({ deleteCleanupDispatchedAt: Number.NaN }));

    expect(valid.deleteCleanupDispatchedAt).toBe(200);
    expect(malformed.deleteCleanupDispatchedAt).toBeUndefined();
  });

  it("preserves valid killed reconciliation ownership metadata", () => {
    const entry = normalizeSubagentRunState(
      baseRun({
        suppressCompletionDelivery: true,
        killReconciliation: {
          killedAt: 200,
          suppressTaskDelivery: true,
          supersededAt: 300,
        },
      }),
    );

    expect(entry.killReconciliation).toEqual({
      killedAt: 200,
      suppressTaskDelivery: true,
      supersededAt: 300,
    });
    expect(entry.suppressCompletionDelivery).toBe(true);
  });

  it("drops malformed killed reconciliation metadata", () => {
    const entry = normalizeSubagentRunState(
      baseRun({
        killReconciliation: { killedAt: Number.NaN },
      }),
    );

    expect(entry.killReconciliation).toBeUndefined();
  });

  it("keeps only complete interrupted-recovery terminal ownership", () => {
    const terminal = {
      endedReason: "subagent-error" as const,
      execution: {
        status: "terminal" as const,
        startedAt: 100,
        endedAt: 200,
        outcome: { status: "error" as const, error: "restart interrupted run" },
      },
      terminalOwner: "interrupted-recovery" as const,
    };
    const valid = normalizeSubagentRunState(baseRun(terminal));
    const malformed = [
      baseRun({ ...terminal, execution: { ...terminal.execution, endedAt: undefined } }),
      baseRun({
        ...terminal,
        execution: { ...terminal.execution, outcome: { status: "ok" } },
      }),
      baseRun({ ...terminal, endedReason: "subagent-complete" }),
      baseRun({ ...terminal, pauseReason: "sessions_yield" }),
    ].map((entry) => normalizeSubagentRunState(entry));

    expect(valid.terminalOwner).toBe("interrupted-recovery");
    expect(malformed.every((entry) => entry.terminalOwner === undefined)).toBe(true);
  });

  it("clears stale cleanupHandled locks for unfinished restored cleanup", () => {
    const entry = normalizeSubagentRunState(baseRun({ cleanupHandled: true }));

    expect(entry.cleanupHandled).toBe(false);
  });

  it("clears stale cleanupHandled locks after delivered notification if cleanup did not finish", () => {
    const entry = normalizeSubagentRunState(
      baseRun({
        cleanupHandled: true,
        delivery: {
          status: "delivered",
          announcedAt: 400,
        },
      }),
    );

    expect(entry.cleanupHandled).toBe(false);
  });

  it("keeps discarded terminal delivery dormant across restart", () => {
    const entry = normalizeSubagentRunState(
      baseRun({
        cleanupHandled: true,
        delivery: {
          status: "discarded",
          discardedAt: 400,
          discardReason: "expired",
        },
      }),
    );

    expect(entry.cleanupHandled).toBe(true);
  });
});
