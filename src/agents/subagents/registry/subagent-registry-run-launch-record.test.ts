import { expect, it } from "vitest";
import { createSubagentRegistrationRecord } from "./subagent-registry-run-launch-record.js";

it("freezes exact return provenance at registration without inventing a human originator", () => {
  const record = createSubagentRegistrationRecord(
    {
      runId: "run-1",
      childSessionKey: "agent:worker:subagent:child",
      requesterSessionKey: "agent:main:parent",
      requesterDisplayKey: "agent:main:parent",
      requesterOrigin: { channel: "discord", to: "dm:123", accountId: "account-1" },
      completionRequesterSessionId: "birth-session",
      expectsCompletionMessage: true,
      task: "verify return route",
      cleanup: "keep",
    },
    {
      now: 100,
      generation: 1,
      lifecycleGeneration: "lifecycle-1",
      requesterAgentId: "main",
      requesterOrigin: { channel: "discord", to: "dm:123", accountId: "account-1" },
    },
  );

  expect(record.returnMetadata).toMatchObject({
    origin: {
      sessionKey: "agent:main:parent",
      sessionId: "birth-session",
      route: { channel: "discord", to: "dm:123", accountId: "account-1" },
    },
    originator: { status: "unknown" },
    responsibleOwner: { agentId: "main" },
    returnChannel: {
      kind: "requester_session",
      sessionKey: "agent:main:parent",
      sessionId: "birth-session",
    },
    workId: "run-1",
    scope: "verify return route",
    requiredEvidence: "provider_target_readback",
  });
});
