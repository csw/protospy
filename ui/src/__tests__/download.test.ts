import { describe, it, expect } from "vitest";
import { deriveFilename } from "@ui/lib/download";

describe("deriveFilename", () => {
  it("prefers a Content-Disposition filename", () => {
    expect(
      deriveFilename({
        contentDisposition: 'attachment; filename="report.pdf"',
        uri: "/api/x",
        contentType: "application/pdf",
      }),
    ).toBe("report.pdf");
  });

  it("decodes the RFC 5987 extended filename* form", () => {
    expect(
      deriveFilename({
        contentDisposition: "attachment; filename*=UTF-8''na%C3%AFve.txt",
      }),
    ).toBe("naïve.txt");
  });

  it("uses the request path basename when it already has an extension", () => {
    expect(deriveFilename({ uri: "/api/download/artifact.bin?token=1" })).toBe(
      "artifact.bin",
    );
  });

  it("appends a content-type extension when the basename has none", () => {
    expect(
      deriveFilename({ uri: "/api/data", contentType: "application/json" }),
    ).toBe("data.json");
    expect(deriveFilename({ uri: "/api/page", contentType: "text/html" })).toBe(
      "page.html",
    );
  });

  it("falls back to body.bin when nothing is known", () => {
    expect(deriveFilename({})).toBe("body.bin");
    expect(deriveFilename({ contentType: "application/octet-stream" })).toBe(
      "body.bin",
    );
  });

  it("derives an xml extension from the +xml suffix", () => {
    expect(
      deriveFilename({ uri: "/svc", contentType: "application/soap+xml" }),
    ).toBe("svc.xml");
  });

  it("derives json from a vendor +json content-type (the _msearch case)", () => {
    // Regression: a vendor structured-syntax type previously fell through to
    // `.bin`, yielding the surprising `_msearch.bin` for a JSON body.
    expect(
      deriveFilename({
        uri: "/_msearch",
        contentType: "application/vnd.elasticsearch+json;compatible-with=8",
      }),
    ).toBe("_msearch.json");
  });

  it("derives ndjson from x-ndjson and vendor ndjson types", () => {
    expect(
      deriveFilename({ uri: "/bulk", contentType: "application/x-ndjson" }),
    ).toBe("bulk.ndjson");
    expect(
      deriveFilename({
        uri: "/bulk",
        contentType: "application/vnd.elasticsearch+x-ndjson",
      }),
    ).toBe("bulk.ndjson");
  });

  it("derives common extensions from the MIME registry", () => {
    expect(deriveFilename({ uri: "/img", contentType: "image/png" })).toBe(
      "img.png",
    );
    expect(
      deriveFilename({ uri: "/doc", contentType: "application/pdf" }),
    ).toBe("doc.pdf");
  });
});
