import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import {
  connectionToast,
  notifyConnection,
  notifyCopied,
  notifyCopyFailed,
} from "@ui/lib/toast";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("connectionToast (pure decision)", () => {
  it("is silent on first connect (connecting → open, no prior reconnecting)", () => {
    expect(connectionToast(null, "connecting")).toBeNull();
    expect(connectionToast("connecting", "open")).toBeNull();
  });

  it("fires one error toast when the stream is lost", () => {
    expect(connectionToast("open", "reconnecting")).toEqual({
      kind: "error",
      message: "Connection lost — reconnecting…",
    });
  });

  it("does not re-toast on repeated reconnecting events", () => {
    expect(connectionToast("reconnecting", "reconnecting")).toBeNull();
  });

  it("fires a success toast on recovery (reconnecting → open)", () => {
    expect(connectionToast("reconnecting", "open")).toEqual({
      kind: "success",
      message: "Reconnected",
    });
  });

  it("treats reconnecting from a null prior as a loss", () => {
    expect(connectionToast(null, "reconnecting")).toEqual({
      kind: "error",
      message: "Connection lost — reconnecting…",
    });
  });
});

describe("toast emission wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifyCopied fires a success toast", () => {
    notifyCopied();
    expect(toast.success).toHaveBeenCalledWith("Copied to clipboard");
  });

  it("notifyCopyFailed fires an error toast", () => {
    notifyCopyFailed();
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy to clipboard");
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
