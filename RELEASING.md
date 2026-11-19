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

Install a beta for testing: Homebridge UI → *Plugins* → ⋮ on this plugin → *Manage Version* → choose the beta, or in the Homebridge storage directory `npm install @tplnet/homebridge-heos-multiroom-audio@beta`. Back to the regular version: choose the latest regular version the same way, or `npm install @tplnet/homebridge-heos-multiroom-audio@latest`.

## One-time setup

The package was renamed from `@tplnet/homebridge-denon-heos-audio` to `@tplnet/homebridge-heos-multiroom-audio` (1.5.0). npm only allows Trusted Publishing for a package that exists, so a new package name needs one manual publish:

1. Publish a placeholder once (in an empty folder, with 2FA):

   ```bash
   mkdir /tmp/placeholder && cd /tmp/placeholder
   npm init -y --scope=@tplnet >/dev/null
   npm pkg set name=@tplnet/homebridge-heos-multiroom-audio version=0.0.0-stage description="Placeholder for the Trusted Publishing setup"
   npm publish --access public --tag stage
   npm deprecate @tplnet/homebridge-heos-multiroom-audio@0.0.0-stage "Placeholder, not a usable version"
   ```

2. **npmjs.com** → package → **Settings** → **Trusted Publisher** → **GitHub Actions**, same as for homebridge-tahoma:
   user `tplnet`, repository `homebridge-heos-multiroom-audio`, workflow `publish.yml`, environment **empty**, permission **stage only**.
3. **Publishing access**: *Require two-factor authentication and disallow tokens*.
4. After the first real version is approved: point `latest` to it while there is no regular version yet, so that new installs don't get the placeholder:
   `npm dist-tag add @tplnet/homebridge-heos-multiroom-audio@<version> latest`.
5. Deprecate the old package with a pointer to the new one:
   `npm deprecate @tplnet/homebridge-denon-heos-audio "Renamed to @tplnet/homebridge-heos-multiroom-audio – see https://github.com/tplnet/homebridge-heos-multiroom-audio#switching-from-tplnethomebridge-denon-heos-audio"`

No npm token is stored in GitHub and no GitHub environment is needed: the approval on npm with 2FA / passkey is the release gate.
