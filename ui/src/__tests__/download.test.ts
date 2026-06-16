import { describe, it, expect } from "vitest";
import { deriveFilename } from "@ui/lib/download";

describe("deriveFilename", () => {
  describe("Content-Disposition priority", () => {
    it("returns filename from quoted Content-Disposition", () => {
      expect(
        deriveFilename({
          contentDisposition: 'attachment; filename="report.pdf"',
        }),
      ).toBe("report.pdf");
    });

    it("returns filename from unquoted Content-Disposition", () => {
      expect(
        deriveFilename({ contentDisposition: "attachment; filename=data.bin" }),
      ).toBe("data.bin");
    });

    it("decodes RFC 5987 extended filename*= notation", () => {
      expect(
        deriveFilename({
          contentDisposition: "attachment; filename*=UTF-8''my%20file.json",
        }),
      ).toBe("my file.json");
    });

    it("prefers Content-Disposition over URI path segment", () => {
      expect(
        deriveFilename({
          uri: "/path/other.txt",
          contentDisposition: 'attachment; filename="override.pdf"',
        }),
      ).toBe("override.pdf");
    });
  });

  describe("URI path segment fallback", () => {
    it("uses the last path segment when it has an extension", () => {
      expect(deriveFilename({ uri: "/api/data/export.csv" })).toBe(
        "export.csv",
      );
    });

    it("ignores query string when extracting the path segment", () => {
      expect(deriveFilename({ uri: "/files/image.png?v=1&token=abc" })).toBe(
        "image.png",
      );
    });

    it("skips a path segment without an extension", () => {
      expect(
        deriveFilename({ uri: "/api/data", mediaType: "application/json" }),
      ).toBe("body.json");
    });

    it("skips an empty path", () => {
      expect(deriveFilename({ uri: "/", mediaType: "text/plain" })).toBe(
        "body.txt",
      );
    });
  });

  describe("media-type extension inference", () => {
    it("infers .json for application/json", () => {
      expect(deriveFilename({ mediaType: "application/json" })).toBe(
        "body.json",
      );
    });

    it("infers .png for image/png", () => {
      expect(deriveFilename({ mediaType: "image/png" })).toBe("body.png");
    });

    it("infers .txt for text/plain", () => {
      expect(deriveFilename({ mediaType: "text/plain" })).toBe("body.txt");
    });

    it("strips parameters from media type before mapping", () => {
      expect(
        deriveFilename({ mediaType: "application/json; charset=utf-8" }),
      ).toBe("body.json");
    });

    it("falls back to .bin for an unknown media type", () => {
      expect(deriveFilename({ mediaType: "application/x-custom-format" })).toBe(
        "body.bin",
      );
    });

    it("falls back to .bin when mediaType is absent", () => {
      expect(deriveFilename({})).toBe("body.bin");
    });
  });
});
