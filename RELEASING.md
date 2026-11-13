# Releasing

New versions are published to npm automatically by the [Publish workflow](.github/workflows/publish.yml) when a GitHub release is published.

## One-time setup

The first version (1.0.0) is published manually, because npm only allows configuring Trusted Publishing for an existing package:

```bash
npm login
npm publish
```

Then connect npm and GitHub:

1. **npmjs.com** → package `@tplnet/homebridge-denon-heos-audio` → **Settings** → **Trusted Publisher** → **GitHub Actions**:
   - Organization or user: `tplnet`
   - Repository: `homebridge-denon-heos-audio`
   - Workflow filename: `publish.yml`
   - Environment name: `npm`
2. Same page, **Publishing access**: choose *Require two-factor authentication and disallow tokens*. From now on only the workflow (and you with 2FA) can publish.
3. **GitHub** → repository → **Settings** → **Environments** → **New environment** `npm`. Optionally add yourself as *required reviewer*, so every publish needs a click from you.

No npm token is stored in GitHub.

## Publishing a new version

1. Update `CHANGELOG.md` (new section at the top).
2. Run all checks locally (audit, lint, tests, smoke test):

   ```bash
   npm run check
   ```

3. Set the version, commit and tag:

   ```bash
   npm version 1.1.0 -m "release: %s"   # or: npm version patch / minor / major
   git push --follow-tags
   ```

4. GitHub → **Releases** → **Draft a new release** → choose the tag (e.g. `v1.1.0`) → title `1.1.0` → paste the changelog section → **Publish release**.

The workflow then checks that the tag matches `package.json`, runs `npm audit`, lint, tests and the smoke test against the latest Homebridge, and publishes to npm with provenance.
Versions with a suffix (e.g. `1.1.0-beta.1`) are published with the npm tag `next`, so they are not offered as an update in the Homebridge UI.
