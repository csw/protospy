import { describe, it, expect } from "vitest";
import { connectionToast } from "@ui/lib/connection-toast";

// Pure decision — no `sonner`, no DOM — so it runs in the `node` project.
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
