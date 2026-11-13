# Releasing

A new version is published with **one command**. Pushing a version tag starts the [Publish workflow](.github/workflows/publish.yml),
which publishes the package to npm (with provenance) and creates the GitHub release with the notes from `CHANGELOG.md`.

## Publishing a new version

1. Add a section for the new version at the top of `CHANGELOG.md`, e.g. `## 1.1.0`, and commit it.
2. Run:

   ```bash
   npm version 1.1.0      # or: npm version patch | minor | major
   ```

   This
   - runs all checks first (`npm audit`, lint, unit tests, smoke test),
   - stops if `CHANGELOG.md` has no section for the new version,
   - sets the version, commits, tags (`v1.1.0`) and pushes.

That's it. The workflow then checks the tag against `package.json`, runs `npm audit`, lint, tests and the smoke test against the latest Homebridge release,
publishes to npm and creates the GitHub release. Follow it under **Actions** on GitHub.

Versions with a suffix (e.g. `1.1.0-beta.1`) are published with the npm tag `next` and marked as pre-release on GitHub, so they are not offered as an update in the Homebridge UI.

## One-time setup (already done)

1. The first version was published manually (`npm login`, `npm publish`), because npm only allows Trusted Publishing for an existing package.
2. **npmjs.com** → package → **Settings** → **Trusted Publisher** → **GitHub Actions**: user `tplnet`, repository `homebridge-denon-heos-audio`, workflow `publish.yml`, environment `npm`.
3. **Publishing access**: *Require two-factor authentication and disallow tokens*.
4. **GitHub** → **Settings** → **Environments** → environment `npm` (optionally with yourself as *required reviewer*, then every publish waits for your approval).

No npm token is stored in GitHub.
