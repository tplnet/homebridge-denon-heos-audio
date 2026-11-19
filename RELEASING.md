# Releasing

Releases work like in [homebridge-tahoma](https://github.com/tplnet/homebridge-tahoma): pushing a version tag starts the [Publish workflow](.github/workflows/publish.yml),
which **stages** the package on npm and creates the GitHub release. The new version only becomes public after you approve it on npm with 2FA / passkey,
so a compromised workflow or repository can't publish on its own.

## Publishing a new version

1. Add a section for the new version at the top of `CHANGELOG.md`, e.g. `## 1.1.0`, and commit it.
2. Run:

   ```bash
   npm version 1.1.0      # or: npm version patch | minor | major
   ```

   This runs all checks first (`npm audit`, lint, unit tests, smoke test), stops if `CHANGELOG.md` has no section for the new version,
   then sets the version, commits, tags (`v1.1.0`) and pushes commit and tag.
3. The workflow checks the tag against `package.json`, runs `npm audit`, lint, tests and the smoke test against the latest Homebridge release,
   **stages** the package on npm (with provenance) and creates the GitHub release with the notes from `CHANGELOG.md`.
4. **Approve** the staged version: npmjs.com → package → **Staged Packages**, or

   ```bash
   npm stage approve <stage-id>
   ```

   The stage id is shown in the summary of the workflow run on GitHub (Actions).

## Release notes

Before tagging, describe the changes in a `## X.Y.Z` section at the top of `CHANGELOG.md`. `npm version` refuses to run without it,
and the workflow uses this section as the description of the GitHub release, followed by what was checked for the release
(newest Homebridge release, `npm audit`, tests, tested Node.js and supported Homebridge versions) and a link to the changelog
(and stops before publishing if it is missing). Preview: `node scripts/release-notes.mjs 1.1.0`.

Write each entry from the user's point of view first (what changes in Apple Home, the Homebridge UI or the log), technical details after it;
with several entries, group them under `### Added`, `### Changed`, `### Fixed` and `### Security`.

Existing releases can be (re)filled with **Actions** → **Release notes** → **Run workflow** (a tag such as `v1.2.6`, or `all`). The section *Checked for this release* written by the publish run is kept.

## Beta first, release on request

Every change is published as a **beta** first. A regular release is only made when the maintainer asks for it.

1. Add a section for the beta at the top of `CHANGELOG.md`, e.g. `## 1.5.0-beta.1 (2026-11-19)`, and publish it like any version (`npm version 1.5.0-beta.1`, push, approve on npm). The next beta of the same version is `1.5.0-beta.2`, with its own section for the new changes.
2. Betas are staged with the npm dist-tag **`beta`** (the identifier of the version) and marked as pre-release on GitHub. `latest` stays on the last regular release, so users of the regular version are not offered the beta.
3. The Homebridge UI offers newer betas to users who already run a beta of this plugin (it looks for the dist-tag `beta`), and to users who enabled betas for this plugin.
4. **Release:** when the betas have been tested, write a `## 1.5.0 (date)` section that combines the changes of all its betas (the beta sections stay below it), then `npm version 1.5.0`, push and approve. Users of the beta get the regular version as an update.

Install a beta for testing: Homebridge UI → *Plugins* → ⋮ on this plugin → *Manage Version* → choose the beta, or in the Homebridge storage directory `npm install @tplnet/homebridge-denon-heos-audio@beta`. Back to the regular version: choose the latest regular version the same way, or `npm install @tplnet/homebridge-denon-heos-audio@latest`.

## One-time setup

1. The first version was published manually (`npm login`, `npm publish`), because npm only allows Trusted Publishing for an existing package.
2. **npmjs.com** → package → **Settings** → **Trusted Publisher** → **GitHub Actions**, same as for homebridge-tahoma:
   user `tplnet`, repository `homebridge-denon-heos-audio`, workflow `publish.yml`, environment **empty**, permission **stage only**.
3. **Publishing access**: *Require two-factor authentication and disallow tokens*.

No npm token is stored in GitHub and no GitHub environment is needed: the approval on npm with 2FA / passkey is the release gate.
