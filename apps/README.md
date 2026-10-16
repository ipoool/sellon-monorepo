# apps/

Native and standalone applications that are part of SellOn but are not the Go
API or the Next.js web app.

| App | Platform | What it is |
|---|---|---|
| `photoboost/` | Android tablet | Coin-op photo booth. Customer pays by QRIS, takes four shots, picks a frame, gets a print. |

## Adding an app

1. Create it here (`flutter create`, or whatever the platform needs).
2. Add a filter and a job to `.github/workflows/ci.yml` — the pipeline is
   monorepo-aware via `dorny/paths-filter`, so a change under `api/` must not
   run this app's tests and vice versa. Remember to add the new job to
   `ci-pass`'s `needs:`, or a failure there will not block a merge.
3. Add its build artefacts to the Flutter/Dart section of the root
   `.gitignore`.

## Shared code

There is deliberately **no** shared package yet. When a second app needs the
SellOn theme, promote `photoboost/lib/theme` and `photoboost/lib/widgets` into
`apps/packages/sellon_ui` and add a pub workspace at `apps/`.

That promotion stays cheap only while one rule holds: **nothing in `theme/` or
`widgets/` may import from `features/`.** Breaking it is what turns a ten
minute extraction into an afternoon.
