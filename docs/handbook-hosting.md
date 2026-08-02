# Handbook hosting (docs.lattice.iwgf.org)

VitePress site over repo `docs/`, deployed as a **second Firebase Hosting
site** in project `warp-12` (same pattern as IWGF leaderboard/ops).

| | |
| --- | --- |
| Local preview | `yarn handbook:dev` → http://localhost:5173 |
| Build | `yarn handbook:build` → `apps/handbook/dist` |
| Deploy | `yarn deploy:firebase:docs` |
| URL (once DNS is live) | https://docs.lattice.iwgf.org |

## One-time Firebase setup

```bash
# Create the Hosting site (id must be globally unique within Firebase)
yarn firebase hosting:sites:create latticedocs --project warp-12

# Bind deploy target name → site id
yarn firebase target:apply hosting lattice-docs latticedocs --project warp-12
```

`.firebaserc` already lists the `lattice-docs` target; `target:apply` fills
the site id.

## One-time DNS (iwgf.org)

In your DNS provider for `iwgf.org`, add:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `docs.lattice` | `latticedocs.web.app` |

Then in Firebase Console → Hosting → `latticedocs` → **Add custom domain** →
`docs.lattice.iwgf.org` and follow the SSL prompts (Firebase provisions the
cert; free).

Until the custom domain is connected, the site is still reachable at
`https://latticedocs.web.app` after the first deploy.

## Cost

A second Hosting site in the same Blaze project does not add a base fee.
Static handbook traffic almost always stays inside Hosting’s free allotment.

## What is published

Player pages: Deep Lattice product charter (`/deep-lattice`), Deep Lattice
status log, overview, Sector 11 briefing (`story.md`), Atlas, LPGN, playtest
notes. Design: ROADMAP, Deep Lattice lab, ADRs,
desktop-build, viability. Normative rules stay PDF (also copied into the
handbook `public/` for convenience, and remain on lattice.iwgf.org/docs/).
