# Deployment

Cloudship Longshot is a static site. The production build in `dist/` is plain HTML, JavaScript and
assets with no server component, so it can be hosted anywhere that serves files. The supported and
automated target is **GitHub Pages**.

---

## 1. How the workflow works

`.github/workflows/deploy.yml` runs on every push to the default branch, and can also be started
by hand from the **Actions** tab (`workflow_dispatch`). It uses the current GitHub Pages flow, in
which the build is uploaded as an artifact and a second job publishes it — nothing is ever committed
to a `gh-pages` branch.

The workflow has two jobs:

**`build`**

1. `actions/checkout@v4` — check out the repository.
2. `actions/setup-node@v4` with Node 22 and `cache: npm` — install Node and restore the npm cache.
3. `npm ci` — install exactly what `package-lock.json` pins.
4. `npm run lint` — lint gate; warnings fail the build.
5. `npm test` — the Vitest unit suite.
6. `npm run build` with `BASE_PATH` set — typecheck plus the Vite production build into `dist/`.
7. `touch dist/.nojekyll` — see below.
8. `actions/configure-pages@v6` with `enablement: true` — read the repository's Pages configuration,
   creating the Pages site if it does not exist yet (see §3).
9. `actions/upload-pages-artifact@v5` with `path: dist` — package `dist/` as the Pages artifact.

**`deploy`**

Runs after `build` succeeds and calls `actions/deploy-pages@v4`, which publishes the artifact and
reports the live URL as the job's environment URL.

Supporting configuration:

- `permissions: { contents: read, pages: write, id-token: write }` — the Pages deployment API
  authenticates with an OIDC token, which is why `id-token: write` is required.
- `concurrency: { group: pages, cancel-in-progress: false }` — queues deployments instead of
  cancelling them, so a partially-uploaded artifact is never published.

### Why `.nojekyll`

GitHub Pages historically passes published files through Jekyll, which ignores files and directories
whose names begin with an underscore. A `.nojekyll` file at the site root switches that off. Vite's
default output does not use leading-underscore names, so this is belt-and-braces rather than a fix
for a known failure — but it costs nothing and removes a whole class of "asset 404s only in
production" mysteries. It is created in the workflow after the build rather than committed to
`public/`, so no build-input directory has to carry a deployment-specific file.

---

## 2. `BASE_PATH` and why it matters

`vite.config.ts` reads the base path from the environment:

```ts
const base = process.env.BASE_PATH ?? '/';
```

Vite bakes this prefix into every generated asset URL in `dist/index.html` and in the bundle. It has
to match the path the site is actually served from.

| Site type                        | Live URL                            | Required `BASE_PATH`    |
| -------------------------------- | ----------------------------------- | ----------------------- |
| Project site (the default)       | `https://<owner>.github.io/<repo>/` | `/<repo>/`              |
| User or organisation site        | `https://<owner>.github.io/`        | `/`                     |
| Custom domain at the domain root | `https://example.com/`              | `/`                     |
| Local `npm run preview`          | `http://localhost:4173/`            | unset (defaults to `/`) |

The deploy workflow sets it automatically for the project-site case:

```yaml
env:
  BASE_PATH: /${{ github.event.repository.name }}/
```

`github.event.repository.name` is the bare repository name, so renaming the repository updates the
base path on the next deploy with no edit required.

### What a wrong base path looks like

If `BASE_PATH` is `/` but the site is served from `/cradle_web_game/`, the HTML asks the browser for
`/assets/index-abc123.js`. GitHub Pages has nothing at that path — the file is really at
`/cradle_web_game/assets/index-abc123.js` — so every asset request returns **404**. The page itself
loads (it is at the right URL), the scripts do not, and the result is a **blank page** with a
console full of 404s and a module-loading error. The same happens in reverse if the prefix is set
but the site is served from the root.

This failure is invisible locally: `npm run dev` and a default `npm run preview` both serve from `/`,
so the base path is correct by accident. It only appears once deployed. To reproduce it locally,
build with the prefix and preview under the same prefix:

```bash
BASE_PATH=/cradle_web_game/ npm run build
npm run preview -- --base /cradle_web_game/
```

On Windows PowerShell:

```powershell
$env:BASE_PATH = '/cradle_web_game/'
npm run build
npm run preview -- --base /cradle_web_game/
```

---

## 3. Enabling Pages

The `Configure Pages` step passes `enablement: true`, so in the normal case the workflow creates the
Pages site itself on the first run and there is nothing to do but push.

That call needs the workflow token to be allowed to administer Pages. If it is not — some
organisation policies withhold it — the step fails with `Get Pages site failed … Not Found`, and
Pages has to be switched on by hand once:

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**. Do _not_ pick "Deploy from
   a branch".
3. Re-run the deploy workflow (**Actions → Deploy to GitHub Pages → Run workflow**) or push a commit
   to the default branch.

GitHub offers "Static HTML" and "GitHub Pages Jekyll" starter workflows when you select that source.
Ignore both — `deploy.yml` already does this job, and committing a starter workflow would put a
second, competing deployment in the repository.

While **Source** is set to "Deploy from a branch", GitHub serves the repository root verbatim. That
publishes the _source_ `index.html`, whose `<script type="module" src="/src/main.ts">` the browser
cannot execute, so the boot splash paints and the game never starts. A site that loads but stays on
the splash — with `/assets/` returning 404 — is this, not a build failure.

The first successful `deploy` job prints the live URL, and it also appears at the top of
**Settings → Pages**.

If the repository is private, Pages publishing requires a plan that includes private-repo Pages;
otherwise make the repository public.

---

## 4. Deploying as a user or organisation site

A repository named exactly `<owner>.github.io` is served from the domain root, so the repository
name must **not** be part of the base path.

1. Name the repository `<owner>.github.io`.
2. In `.github/workflows/deploy.yml`, change the build step's environment to:

   ```yaml
   env:
     BASE_PATH: /
   ```

3. Deploy as normal. The site appears at `https://<owner>.github.io/`.

The same `BASE_PATH: /` applies when serving from the root of a custom domain. Add the domain in
**Settings → Pages → Custom domain**; GitHub then manages the `CNAME` file in the published output
for you.

---

## 5. Verifying a deployment

Work through this after every deploy that changes the build or the base path.

1. **Confirm the workflow is green.** Actions → the latest _Deploy to GitHub Pages_ run. Both
   `build` and `deploy` must be green. Open the `deploy` job to get the published URL.
2. **Hard-refresh the site.** `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (macOS). Pages caches
   aggressively, and a stale service worker or cached `index.html` will otherwise show you the old
   build and send you chasing a phantom.
3. **Check the Network tab.** Open DevTools _before_ reloading, filter to `JS` and `Img`, then
   reload. Every request should be **200**. A single 404 on `/assets/...` means the base path is
   wrong — compare the requested path against the repository name.
4. **Check the Console.** Expect no errors. `Failed to load module script` or a MIME-type complaint
   about `text/html` means the browser received a 404 page where it expected JavaScript — again a
   base-path problem.
5. **Play a full run.** Launch, fly, land, and reach the results screen. This confirms the art and
   audio assets resolved, not just the bundle.
6. **Check a phone.** Load the same URL on a real device and confirm hold-drag-release works, the
   canvas fills the screen, and rotating the device resizes cleanly.

## 6. Local production check

The fastest way to catch a broken build before it reaches Pages:

```bash
npm run build
npm run preview
```

`preview` serves `dist/` on `http://localhost:4173`. This is the exact artifact the workflow
uploads, minified and bundled, so anything that breaks only in production — a missing asset, a
tree-shaken import, a typecheck failure — shows up here.

The Playwright end-to-end suite (`npm run test:e2e`) drives this same build automatically: its
`webServer` runs `npm run build && npm run preview` on port 4173 before the tests start.

---

## 7. Troubleshooting

| Symptom                                                              | Likely cause                                                    | Fix                                                                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Blank page, console shows 404s for `/assets/*.js`                    | `BASE_PATH` does not match the served path                      | Set `BASE_PATH` to `/<repo>/` for a project site, `/` for a user/organisation or custom-domain site, then redeploy |
| `Failed to load module script … MIME type "text/html"`               | The asset 404'd and Pages returned an HTML error page           | Same as above — fix the base path                                                                                  |
| Build job fails: _Get Pages site failed … Not Found_                 | `enablement: true` could not create the site under this token   | Settings → Pages → Source: **GitHub Actions**, then re-run the workflow                                            |
| Site loads but stays on the boot splash; `/assets/` 404s             | Source is still "Deploy from a branch", serving the repo root   | Settings → Pages → Source: **GitHub Actions**, then re-run the workflow                                            |
| Deploy job fails on the OIDC token                                   | `permissions` block is missing `id-token: write`                | Restore the workflow's `permissions: { contents: read, pages: write, id-token: write }`                            |
| `npm ci` fails with a lockfile mismatch                              | `package.json` changed without regenerating `package-lock.json` | Run `npm install` locally and commit the updated lockfile                                                          |
| Workflow fails at the lint step                                      | Lint runs with `--max-warnings 0`                               | Run `npm run lint` locally and fix, or `npm run format` for formatting-only issues                                 |
| Site shows an old build after a green deploy                         | Browser or CDN cache                                            | Hard-refresh; if it persists, wait a minute and retry — Pages propagation is not instant                           |
| Files or directories starting with `_` are missing                   | Jekyll processing                                               | The workflow creates `dist/.nojekyll`; confirm that step ran                                                       |
| Fonts or images 404 only in production                               | Asset referenced by an absolute `/...` path in source           | Import the asset so Vite rewrites it, or place it in `public/` and reference it relative to the base               |
| Custom domain shows the wrong site or a certificate warning          | DNS not propagated, or `BASE_PATH` still set to `/<repo>/`      | Verify the DNS records in Settings → Pages, and set `BASE_PATH` to `/`                                             |
| Two deploys race and the site flickers between versions              | Concurrent runs                                                 | The `concurrency: pages` group already serialises this; confirm it has not been removed                            |

---

## 8. Continuous integration

`.github/workflows/ci.yml` covers pull requests and pushes to non-default branches with a single
fast job: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`, and a production build smoke
check. It does not deploy. This keeps branch feedback quick while guaranteeing that anything merged
to the default branch will survive the deploy workflow's identical gates.
