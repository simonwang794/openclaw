import { beforeEach, describe, expect, it, vi } from "vitest";

const getLoadedChannelPluginById = vi.hoisted(() => vi.fn());
vi.mock("../../../channels/plugins/registry-loaded.js", () => ({ getLoadedChannelPluginById }));

import { verifySubagentProviderReceipt } from "./subagent-provider-readback.js";

const receipt = { channel: "discord", to: "chat-1", messageId: "message-1" };

describe("subagent external provider readback", () => {
  beforeEach(() => getLoadedChannelPluginById.mockReset());

  it("records unsupported when the provider exposes no exact readback", async () => {
    getLoadedChannelPluginById.mockReturnValue({ outbound: {} });
    expect(await verifySubagentProviderReceipt({ cfg: {}, receipt })).toEqual({
      readback: "unsupported",
    });
  });

  it("performs supported readback and distinguishes success from failure", async () => {
    const readbackSentMessage = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    getLoadedChannelPluginById.mockReturnValue({ outbound: { readbackSentMessage } });
    expect(await verifySubagentProviderReceipt({ cfg: {}, receipt })).toEqual({
      readback: "passed",
    });
    expect(await verifySubagentProviderReceipt({ cfg: {}, receipt })).toEqual({
      readback: "failed",
    });
    expect(readbackSentMessage).toHaveBeenCalledWith({ cfg: {}, ...receipt });
  });
});
