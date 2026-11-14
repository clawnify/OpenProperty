# CI required checks (WS-S #1)

## What runs

Workflow: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

On every PR to `master` and every push to `master` (skipped when the diff is
**only** Markdown / `docs/**`), GitHub Actions runs:

1. `pnpm typecheck` (in parallel with build)
2. `pnpm build`
3. `pnpm test` (emulator suite — **must exit 0**; R6 notification cases may be `test.todo` until WS-L)

Job name shown in the Checks UI: **`typecheck / build / test`**.

## Make the check required (owner action)

Branch protection cannot be set from this PR alone — a repo admin/owner must click once in GitHub:

1. Open **Settings → Branches → Branch protection rules** for `master`  
   (or **Rules → Rulesets** if the repo uses rulesets).
2. Enable **Require status checks to pass before merging**.
3. Add the required check named **`typecheck / build / test`**  
   (exact job `name` from the workflow; appears after the workflow has run at least once on the default branch or on a PR).
4. Prefer also: **Require a pull request before merging**, and do **not** allow bypass for non-admins unless intentional.
5. Save.

Until that click, the workflow still runs on PRs but merge is not blocked by GitHub.

## Notes

- Do **not** require Playwright (`pnpm test:browser`) or the full dashboard run in this gate — those are slower / optional.
- R6 notification todos stay as `test.todo` until **WS-L**; they must not fail CI.
- Action versions are pinned by commit SHA in the workflow (not floating `@v4` tags alone).
- Related Auth owner click (leaked-password + min length): [`docs/ops/auth-password-policy.md`](./auth-password-policy.md).
