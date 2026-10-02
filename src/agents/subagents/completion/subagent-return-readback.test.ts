import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { seedUnindexedTranscriptForTest } from "../../../config/sessions/session-accessor.sqlite-import.test-support.js";
import { closeOpenClawAgentDatabasesForTest } from "../../../state/openclaw-agent-db.js";
import { closeOpenClawStateDatabaseForTest } from "../../../state/openclaw-state-db.js";
import { withOpenClawTestState } from "../../../test-utils/openclaw-test-state.js";
import { readExactSessionReturnAck } from "./subagent-return-readback.js";

afterEach(() => {
  closeOpenClawAgentDatabasesForTest();
  closeOpenClawStateDatabaseForTest();
});

it("reads back the exact visible final from the birth session, not an accepted send", async () => {
  await withOpenClawTestState({ label: "subagent-return-readback" }, async (state) => {
    const sessionId = "birth-session";
    const sessionKey = "agent:main:parent";
    const runId = "return-run";
    const scope = {
      agentId: "main",
      env: state.env,
      sessionId,
      sessionKey,
      storePath: path.join(state.sessionsDir(), "sessions.json"),
    };
    const events = [
      { type: "session", version: 3, id: sessionId },
      {
        type: "message",
        id: "visible-final",
        parentId: null,
        message: {
          role: "assistant",
          stopReason: "stop",
          content: [{ type: "text", text: "Completed result" }],
          __openclaw: { runId },
        },
      },
    ];
    await seedUnindexedTranscriptForTest({
      ...scope,
      entry: { sessionId, updatedAt: 2 },
      events: events.map((event, seq) => ({
        session_id: sessionId,
        seq,
        created_at: seq + 1,
        event_json: JSON.stringify(event),
      })),
    });
    await expect(
      readExactSessionReturnAck({
        scope,
        expectedSessionKey: sessionKey,
        expectedSessionId: sessionId,
        runId,
      }),
    ).resolves.toMatchObject({
      sessionKey,
      sessionId,
      messageId: "visible-final",
      source: "transcript",
    });
    await expect(
      readExactSessionReturnAck({
        scope,
        expectedSessionKey: sessionKey,
        expectedSessionId: "replacement-session",
        runId,
      }),
    ).resolves.toBeUndefined();
    await expect(
      readExactSessionReturnAck({
        scope,
        expectedSessionKey: sessionKey,
        expectedSessionId: sessionId,
        runId: "different-run",
      }),
    ).resolves.toBeUndefined();
  });
});
