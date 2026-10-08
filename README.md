# Family recipe box (Mealie fork)

**TL;DR:** this fork exists to run Mealie with one change: scaled recipes show
the tidiest exact unit (2 tsp at 3x reads as 2 tbsp). The change lives on the
[`smart-scaling`](../../tree/smart-scaling) branch. This `family` branch only
holds the build: every morning GitHub checks for a new Mealie release, adds our
change, runs the scaling tests, and publishes `ghcr.io/ashley-mcmichael/mealie:family`.
A home server pulls that image. If the change stops fitting, the build fails
and sends a phone alert.

**Needs your attention:** the goal is to offer the change to Mealie upstream and
retire this fork once it is accepted.

- Upstream: https://github.com/mealie-recipes/mealie (AGPL-3.0). This fork's
  source is public, which covers the license for family users.
- Run a build by hand: Actions → Build family Mealie → Run workflow.
- Moving the patch to a new base: rebase `smart-scaling`, then update
  `PATCH_BASE` in `.github/workflows/family-build.yml`.
