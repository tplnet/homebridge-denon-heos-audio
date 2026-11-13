/**
 * Runs during `npm version` (after the version in package.json was updated):
 * fails if CHANGELOG.md has no section for the new version, so no release without release notes.
 */
import fs from "node:fs";

const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const changelog = fs.readFileSync("CHANGELOG.md", "utf8");

if (!changelog.split("\n").some((line) => line.trim() === `## ${version}`)) {
  console.error(`CHANGELOG.md has no section "## ${version}". Add the release notes first, then run npm version again.`);
  process.exit(1);
}
console.log(`CHANGELOG.md contains release notes for ${version}.`);
