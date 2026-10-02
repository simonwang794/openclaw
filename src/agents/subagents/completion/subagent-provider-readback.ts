import { getLoadedChannelPluginById } from "../../../channels/plugins/registry-loaded.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import type { SubagentCompletionDeliveryState } from "../registry/subagent-registry-read.types.js";

type ProviderReceipt = NonNullable<SubagentCompletionDeliveryState["providerReceipt"]>;
type Verification = NonNullable<SubagentCompletionDeliveryState["verification"]>;

/** Independently verify that a sent message is visible at its provider target. */
export async function verifySubagentProviderReceipt(params: {
  cfg: OpenClawConfig;
  receipt: ProviderReceipt;
}): Promise<Verification> {
  const readback = getLoadedChannelPluginById(params.receipt.channel)?.outbound
    ?.readbackSentMessage;
  if (!readback) {
    return { readback: "unsupported" };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const passed = await Promise.race([
      readback({ cfg: params.cfg, ...params.receipt }),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), 3_000);
        timer.unref?.();
      }),
    ]);
    return { readback: passed ? "passed" : "failed" };
  } catch {
    return { readback: "failed" };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
