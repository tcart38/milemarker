# MileMarker

## Versioning

Every change that ships (features, fixes, UI changes) must bump the version number in the same change.

- Bump `version` in `frontend/package.json` and `backend/package.json`, and the matching top-level `version` fields in both `package-lock.json` files. Keep all four in sync.
- Use semver: patch (1.3.0 → 1.3.1) for fixes and small changes, minor (1.3.x → 1.4.0) for new features, major for breaking changes. If unsure which, ask.
- After the change lands on main, tag the commit `vX.Y.Z` (annotated). Pushing a tag publishes a versioned Docker image through `.github/workflows/docker-publish.yml`.
- The version appears in Settings (served by `GET /api/settings`).
