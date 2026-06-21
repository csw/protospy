// Render a reg-suit comparison result as a Markdown job summary.
//
// reg-suit writes its result to `<workingDir>/out.json` (filename arrays:
// newItems, failedItems [= changed], deletedItems, passedItems). This turns that
// into a compact table plus a link to the S3-hosted diff report, for the GitHub
// Actions run page ($GITHUB_STEP_SUMMARY). It is read-only and best-effort: if no
// result exists (capture/compare never ran), it prints a note instead of failing.
//
// Usage: node scripts/reg-summary.mjs <commit-sha>   (sha keys the S3 report URL)

import { readFileSync } from "node:fs";

const sha = process.argv[2];
const workingDir = ".reg";
const outPath = `${workingDir}/out.json`;

function read(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

let result;
try {
  result = read(outPath);
} catch {
  console.log(
    "_No visual-regression result was produced (capture or compare did not run)._",
  );
  process.exit(0);
}

const count = (key) => (result[key] ?? []).length;
const lines = [];

lines.push("## Visual regression");
lines.push("");
lines.push("| New | Changed | Deleted | Passed |");
lines.push("| ---: | ---: | ---: | ---: |");
lines.push(
  `| ${count("newItems")} | ${count("failedItems")} | ${count("deletedItems")} | ${count("passedItems")} |`,
);

// Link the published report when we can build its URL from the publish config.
try {
  const s3 = read("regconfig.json").plugins?.["reg-publish-s3-plugin"];
  if (s3?.bucketName && s3?.pathPrefix && sha) {
    const url = `https://${s3.bucketName}.s3.amazonaws.com/${s3.pathPrefix}/${sha}/index.html`;
    lines.push("");
    lines.push(`[Full diff report](${url})`);
  }
} catch {
  // No publish config / unreadable — counts table is still useful on its own.
}

// List changed items (the ones a reviewer most needs to eyeball); new/deleted are
// expected churn on a redesign or a fresh baseline and would only add noise here.
const changed = result.failedItems ?? [];
if (changed.length) {
  lines.push("");
  lines.push("<details><summary>Changed items</summary>");
  lines.push("");
  for (const file of changed) lines.push(`- \`${file}\``);
  lines.push("");
  lines.push("</details>");
}

console.log(lines.join("\n"));
