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

Versions with a suffix (e.g. `1.1.0-beta.1`) are staged with the npm tag `next` and marked as pre-release on GitHub, so they are not offered as an update in the Homebridge UI.

## One-time setup

1. The first version was published manually (`npm login`, `npm publish`), because npm only allows Trusted Publishing for an existing package.
2. **npmjs.com** → package → **Settings** → **Trusted Publisher** → **GitHub Actions**, same as for homebridge-tahoma:
   user `tplnet`, repository `homebridge-denon-heos-audio`, workflow `publish.yml`, environment **empty**, permission **stage only**.
3. **Publishing access**: *Require two-factor authentication and disallow tokens*.

No npm token is stored in GitHub and no GitHub environment is needed: the approval on npm with 2FA / passkey is the release gate.
