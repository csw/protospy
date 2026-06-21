import { describe, it, expect } from "vitest";
import {
  captureFilename,
  matrixSceneToMeta,
  orderScenesByAxis,
  renderCatalog,
  type MatrixSceneInput,
  type ScenarioMeta,
} from "../../scripts/bestiary-catalog";
import { SCENES } from "../test/scenes";

describe("captureFilename", () => {
  it("joins scenario and capture slugs with a hyphen and .png suffix", () => {
    expect(captureFilename("network-errors-connect-refused", "selected")).toBe(
      "network-errors-connect-refused-selected.png",
    );
  });
});

describe("renderCatalog", () => {
  const scenarios: ScenarioMeta[] = [
    {
      family: "Network errors",
      slug: "network-errors-connect-refused",
      title: "Connect refused",
      description: "Upstream TCP connection refused.",
      captures: [
        {
          slug: "selected",
          description: "Bodies tab",
          filename: "network-errors-connect-refused-selected.png",
        },
      ],
    },
    {
      family: "Network errors",
      slug: "network-errors-timeout",
      title: "Upstream timeout",
      description: "Request sent, response never arrived.",
      captures: [
        {
          slug: "selected",
          filename: "network-errors-timeout-selected.png",
        },
      ],
    },
    {
      family: "Compressed bodies",
      slug: "compression-gzip",
      title: "gzip response",
      description: "Wire/decoded dual size display.",
      captures: [
        {
          slug: "list",
          description: "Exchange list — dual size + (gzip)",
          filename: "compression-gzip-list.png",
        },
        {
          slug: "body",
          filename: "compression-gzip-body.png",
        },
      ],
    },
  ];

  const out = renderCatalog(scenarios, { date: "2026-05-27" });

  it("includes YAML front matter with the ticket and date", () => {
    expect(out.startsWith("---\nticket: PRO-219\ndate: 2026-05-27")).toBe(true);
  });

  it("renders one ## heading per family, not per scenario", () => {
    const familyHeadings = out.split("\n").filter((l) => l.startsWith("## "));
    expect(familyHeadings).toEqual([
      "## Network errors",
      "## Compressed bodies",
    ]);
  });

  it("renders a ### heading per scenario", () => {
    const scenarioHeadings = out
      .split("\n")
      .filter((l) => l.startsWith("### "));
    expect(scenarioHeadings).toEqual([
      "### Connect refused",
      "### Upstream timeout",
      "### gzip response",
    ]);
  });

  it("embeds screenshots via Obsidian wikilink syntax", () => {
    expect(out).toContain("![[network-errors-connect-refused-selected.png]]");
    expect(out).toContain("![[compression-gzip-list.png]]");
    expect(out).toContain("![[compression-gzip-body.png]]");
  });

  it("renders capture descriptions as italic captions", () => {
    expect(out).toContain("_Bodies tab_");
    expect(out).toContain("_Exchange list — dual size + (gzip)_");
  });

  it("omits the caption line when a capture has no description", () => {
    // The body capture of compression-gzip has no description.
    const idx = out.indexOf("![[compression-gzip-body.png]]");
    expect(idx).toBeGreaterThan(-1);
    const after = out.slice(idx);
    // The next non-empty line after the image should not be an italic caption.
    const lines = after
      .split("\n")
      .slice(1)
      .filter((l) => l.trim() !== "");
    if (lines.length > 0) {
      expect(lines[0].startsWith("_")).toBe(false);
    }
  });

  it("includes an intro paragraph when provided", () => {
    const withIntro = renderCatalog(scenarios.slice(0, 1), {
      date: "2026-05-27",
      intro: "Snapshot taken on a particular weekday.",
    });
    expect(withIntro).toContain("Snapshot taken on a particular weekday.");
  });
});

describe("matrixSceneToMeta", () => {
  it("maps a matrix scene to a single full-viewport catalog entry", () => {
    const scene: MatrixSceneInput = {
      id: "body-text",
      title: "Plain text body",
      axis: "state",
      description: "A text/plain response body.",
    };
    expect(matrixSceneToMeta(scene)).toEqual({
      family: "Matrix — state axis",
      slug: "body-text",
      title: "Plain text body",
      description: "A text/plain response body.",
      captures: [{ slug: "view", filename: "body-text-view.png" }],
    });
  });

  it("files each axis under its own family heading", () => {
    const families = (["state", "data", "view"] as const).map(
      (axis) =>
        matrixSceneToMeta({ id: "x", title: "X", axis, description: "" })
          .family,
    );
    expect(families).toEqual([
      "Matrix — state axis",
      "Matrix — data axis",
      "Matrix — view axis",
    ]);
  });

  it("appends declared close-ups after the full-viewport view", () => {
    const scene: MatrixSceneInput = {
      id: "dual-size",
      title: "Dual size",
      axis: "data",
      description: "x",
      bestiaryCloseups: [
        { slug: "body-pane", description: "close", componentSelector: "sel" },
      ],
    };
    expect(matrixSceneToMeta(scene).captures).toEqual([
      { slug: "view", filename: "dual-size-view.png" },
      {
        slug: "body-pane",
        description: "close",
        filename: "dual-size-body-pane.png",
      },
    ]);
  });
});

describe("live matrix close-ups", () => {
  it("declare slugs that are unique per scene and never shadow the view shot", () => {
    for (const scene of SCENES) {
      const slugs = (scene.bestiaryCloseups ?? []).map((c) => c.slug);
      // "view" is the reserved full-viewport slug; a close-up using it would
      // overwrite that capture's file.
      expect(slugs).not.toContain("view");
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });
});

describe("orderScenesByAxis", () => {
  it("groups scenes by axis order without dropping or duplicating any", () => {
    const input = [
      { axis: "view" as const, id: "v1" },
      { axis: "state" as const, id: "s1" },
      { axis: "data" as const, id: "d1" },
      { axis: "state" as const, id: "s2" },
    ];
    const ordered = orderScenesByAxis(input);
    expect(ordered.map((s) => s.id)).toEqual(["s1", "s2", "d1", "v1"]);
    expect(ordered).toHaveLength(input.length);
  });

  it("renders one catalog family heading per axis when fed the live matrix", () => {
    const metas = orderScenesByAxis(SCENES).map(matrixSceneToMeta);
    const out = renderCatalog(metas, { date: "2026-06-21" });
    const familyHeadings = out.split("\n").filter((l) => l.startsWith("## "));
    expect(familyHeadings).toEqual([
      "## Matrix — state axis",
      "## Matrix — data axis",
      "## Matrix — view axis",
    ]);
    // Every matrix cell becomes exactly one catalog entry.
    const sceneHeadings = out.split("\n").filter((l) => l.startsWith("### "));
    expect(sceneHeadings).toHaveLength(SCENES.length);
  });
});
