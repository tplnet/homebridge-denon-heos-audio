# @tplnet/homebridge-denon-heos-audio

Maintained fork of hov3rcraft/homebridge-denon-heos-audio ("Homebridge Denon & Marantz HEOS (tplnet)"), platform name `DenonHeosAudio`. Controls Denon / Marantz HEOS speakers, the Denon Home Amp and AV receivers from Apple Home. License GPL-3.0 (from the original project).

## Commands
- `npm run lint`, `npm run build`, `npm test` (builds and runs the unit tests in `test/unit`, no device needed)
- `npm run smoke` – starts Homebridge with simulated HEOS (port 1255) and AVR Control (port 23) devices (compatibility check)
- `npm run check` – everything: `npm audit`, lint, unit tests, smoke test (also runs as `preversion`)
- Other Homebridge versions: `npm install --no-save homebridge@1` / `homebridge@beta`, then `npm test && node scripts/smoke-test.mjs`
- Preview release notes: `node scripts/release-notes.mjs [version]`

## Project rules
- Every device is an external accessory (TV category, one per device, `api.publishExternalAccessories`), because Apple Home allows only one TV per bridge. The TelevisionSpeaker service is linked to the Television service.
- Stable ports: the devices of the start (manual ones and the ones discovered within the first 10 s) are published in one call, sorted by serial number; Homebridge assigns the ports in publish order. Don't publish them one by one again.
- Control protocols: HEOS CLI (TCP 1255, JSON, player ids can be negative), AVR Control (TCP 23) and Hybrid (power via AVR Control, the rest via HEOS CLI). The configured protocol is checked against the open ports at startup.
- Discovery: own SSDP implementation (`src/heosDiscovery.ts`, search target `urn:schemas-denon-com:device:ACT-Denon:1`); device descriptions are only fetched from the device that answered. Manually configured devices always win over automatically added ones.
- Log: the device overview table (~30 s after the start) is the normal-level summary; details per discovered device only in the debug log.
- German settings form (the exception in the language rule below): `schemas/config.schema.de.json` shown when the Homebridge UI language is "Deutsch". It must have the same fields, defaults and limits as `config.schema.json` (checked by `test/unit/configSchema.test.js`).
- The plugin collects no data and only talks to devices in the local network (README "Privacy"); keep it that way.
- Never put real test data (device names such as the maintainer's room names, serial numbers, IP addresses, HEOS player ids) into the repository, tests or docs; use invented values (e.g. `192.0.2.x`, `BLT012345678`).
- **Beta first, release on request:** every change is published as a beta first (`X.Y.Z-beta.N`, npm dist-tag `beta`, pre-release on GitHub; see RELEASING.md). A regular release (`X.Y.Z`, `latest`) is only made when Timo asks for it. While unreleased betas exist, ask him regularly (e.g. after he reports test results, or when a session starts or ends) whether a release should be made.
- Default branch is `main` (not `master`). CHANGELOG headings before 1.3.3 have no date; new ones use `## X.Y.Z (YYYY-MM-DD)`.

## Rules for all tplnet Homebridge projects

These apply to `@tplnet/homebridge-tahoma`, `@tplnet/overkiz-client`, `homebridge-tahoma-local` and `@tplnet/homebridge-denon-heos-audio`. Keep the four projects consistent: a change to the release or check process in one of them goes into all of them.

### Language and wording
- Code, comments, README, CHANGELOG and commit messages in English. No German translation of the plugin (exception for now: the German settings form of `@tplnet/homebridge-denon-heos-audio`).
- User-facing text says "Apple Home", not "HomeKit" (README, settings schema, log messages, execution labels). Technical code comments may keep "HomeKit".

### README
- Every README has the disclaimer: a short note at the top ("Private hobby project, developed in spare time with the help of AI tools. Use at your own risk; support is best effort. See the disclaimer.") and a "Disclaimer" section before the license / credits: private project to keep compatibility, security updates, features and bug fixes going; developed in spare time with the help of AI tools; use at your own risk, no warranty (link to the project's license); questions, bug reports and requests are handled best effort, without guarantee; not affiliated with the brands named in the project.
- Keep the "Compatibility and security" (or "Security") and "Privacy" sections up to date where the README has them.

### Documentation structure
- Keep the README short: what the project is, requirements, installation, quick configuration, compatibility and security, privacy, a "Documentation" list, contributing, disclaimer, license.
- Details go into `docs/`: `configuration.md` (all options, settings for single devices, several gateways), `troubleshooting.md` (problems, debug log, reporting a problem), `releasing.md` (maintainers), images in `docs/images/`. Each page starts with a "← Back to the README" link.
- Links from the README to `docs/` are absolute GitHub URLs (`https://github.com/tplnet/<repo>/blob/master/docs/...`) so they also work on npm; inside `docs/` relative links. `docs/` is not part of the npm package.
- Screenshots of the settings form come from a real Homebridge UI with the plugin (no real credentials, example devices only), collapsible with `<details>`. Update them when the settings form changes.

### Compatibility and CVEs
- Every change and every release: `npm audit --omit=dev` must report 0 vulnerabilities in the runtime dependencies, and plugins must start with the newest Homebridge release (smoke test against `homebridge@latest`, CI on Node.js 22, 24 and 26).
- Automated in `.github/workflows/compat.yml` (weekly, on dependency changes) and in `publish.yml` (blocks the release). Keep this documented in the README.
- Dependabot pull requests can be merged when all checks are green.

### Release process
1. Write a `## X.Y.Z (YYYY-MM-DD)` section at the top of `CHANGELOG.md` **before** `npm version`. Each entry starts with what changes for the user (Apple Home, Homebridge UI, log), technical details after it. With several entries, group them under `### Added`, `### Changed`, `### Fixed`, `### Security`.
2. `npm version patch|minor|major` (the npm `version` script runs `scripts/release-notes.mjs` and refuses to continue without the section), then `git push --follow-tags` (needs annotated tags).
3. `publish.yml` checks tag, CHANGELOG, CVEs, lint, build and Homebridge compatibility, **stages** the package with `npm stage publish` (pre-releases with the dist-tag of their identifier, e.g. `--tag beta` for `X.Y.Z-beta.N`, which the Homebridge UI uses to offer newer betas) and creates the GitHub release: title = version without "v", notes from CHANGELOG plus the "Checked for this release" block and a "Changelog" link, `--generate-notes`, pre-releases marked as such.
4. The maintainer approves the staged version with his passkey (npmjs.com → Staged Packages, or `npm stage approve <id>`).
- Never run `npm publish` manually (npm Trusted Publishing is stage-only; a manual publish burns the version number).
- `release-notes.yml` (Actions → Release notes → tag or `all`) refills existing releases from CHANGELOG.
- Plugin depending on a new client version: release and approve the client first, then `npm install --prefer-online` in the plugin (otherwise ETARGET from the npm cache).

### Git and security
- Commit as `tplnet <tplnet@users.noreply.github.com>`; never put the maintainer's real name or e-mail into commits or files.
- `master` is protected against deletion and force pushes. Security issues: private vulnerability reporting (see `SECURITY.md`).
- Never commit credentials, tokens or gateway PINs; mask them in logs and issues.
