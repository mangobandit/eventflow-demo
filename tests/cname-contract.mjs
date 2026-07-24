import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The site is published by GitHub Pages in "Deploy from a branch" mode straight
// from the repository root. GitHub Pages reads the custom domain from a file
// named CNAME in the published root; if that file disappears or is corrupted,
// the custom domain (mxcwedding.com) stops resolving and the site 404s. This
// contract fails CI the moment that happens so a regression is caught before it
// reaches production.

const root = resolve(import.meta.dirname, "..");
const cnamePath = resolve(root, "CNAME");

assert.ok(existsSync(cnamePath), "CNAME file must exist in the published root");

const raw = readFileSync(cnamePath, "utf8");

// Exactly one apex domain, optional single trailing newline, nothing else.
assert.equal(
  raw.replace(/\n$/, ""),
  "mxcwedding.com",
  "CNAME must contain exactly the apex domain mxcwedding.com",
);
assert.doesNotMatch(raw, /\n[^\n]/, "CNAME must contain a single domain line only");

console.log("CNAME custom-domain contract passed.");
