import { findTranscriptEvent } from "../../../config/sessions/session-accessor.js";
import { isVisibleSubagentResultEventForRun } from "../announce/subagent-announce-result.js";
import type { SubagentCompletionDeliveryState } from "../registry/subagent-registry-read.types.js";

/** Read the exact target transcript after delivery; never promote a send receipt. */
export async function readExactSessionReturnAck(params: {
  scope: Parameters<typeof findTranscriptEvent>[0];
  expectedSessionKey: string;
  expectedSessionId: string;
  runId: string;
}): Promise<SubagentCompletionDeliveryState["targetVisibleAck"]> {
  if (
    params.scope.sessionKey !== params.expectedSessionKey ||
    params.scope.sessionId !== params.expectedSessionId
  ) {
    return undefined;
  }
  const observed = await findTranscriptEvent(params.scope, (event) =>
    isVisibleSubagentResultEventForRun(event, params.runId),
  );
  const event = observed?.event;
  if (!event || typeof event !== "object" || !("id" in event) || typeof event.id !== "string") {
    return undefined;
  }
  return {
    sessionKey: params.expectedSessionKey,
    sessionId: params.expectedSessionId,
    messageId: event.id,
    observedAt: Date.now(),
    source: "transcript",
  };
}
