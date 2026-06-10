import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import {
  notifyConnection,
  notifyCopied,
  notifyCopyFailed,
} from "@ui/lib/toast";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("toast emission wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifyCopied fires a success toast under the shared copy id", () => {
    notifyCopied();
    expect(toast.success).toHaveBeenCalledWith("Copied to clipboard", {
      id: "copy-feedback",
    });
  });

  it("notifyCopyFailed fires an error toast under the shared copy id", () => {
    notifyCopyFailed();
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy to clipboard", {
      id: "copy-feedback",
    });
  });

  it("notifyConnection emits the decided toast on a transition", () => {
    notifyConnection("open", "reconnecting");
    expect(toast.error).toHaveBeenCalledWith("Connection lost — reconnecting…");
    notifyConnection("reconnecting", "open");
    expect(toast.success).toHaveBeenCalledWith("Reconnected");
  });

  it("notifyConnection stays silent when no toast is warranted", () => {
    notifyConnection("connecting", "open");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
