# Device sync and Cloudflare previews

Open **Options → Device sync**, then choose **Enable sync**. Save the recovery key. Use **Link another device** to generate a QR code or a one-use link that expires after ten minutes. Open it on the second device in the same preview and choose **Link this device**. Each device gets a short label automatically. Choose **Rename** in **Linked devices** to change it. Clearing the name restores its original label.

Each puzzle has a private attempt URL such as `/?puzzle=<id>`. The home page resumes a single in-progress puzzle or lists multiple puzzles by most recent play. Ordinary puzzle sharing still gives the recipient their own board.

Moves are saved locally first. Linked devices check for remote changes on focus, on reconnect, and every five seconds while visible. When two devices edit the same puzzle independently, both branches remain available and one is named “conflict copy”. Browser settings and other site origins have separate storage.

## Run locally

From the repository root, build the client with the Rust WebAssembly target installed. Wrangler serves both the client and the sync Worker.

```sh
npm ci
npm run build:cloudflare
npx wrangler@4 d1 migrations apply DB --local
npx wrangler@4 pages dev
```

## Preview a pull request

This repository deploys the static app and its Worker together to the Direct Upload Pages project `klyn-sudoku`. The preview environment starts with an empty binding list. For the first Cloudflare preview, create a preview database with `npx wrangler@4 d1 create sudoku-sync-preview`. In `wrangler.jsonc`, add a record under `env.preview.d1_databases` with binding `DB`, database name `sudoku-sync-preview`, the returned database ID, and migrations directory `cloudflare/migrations`. Commit the binding so future branch builds can reuse it. Apply pending preview migrations before uploading a branch build. Use the branch alias to test across updates so the browser retains its device credentials.

```sh
npm run build:cloudflare
npx wrangler@4 d1 migrations apply DB --env preview --remote
npx wrangler@4 pages deploy dist/client --project-name klyn-sudoku --branch codex/accountless-device-sync
```

Substitute the pull request's head branch in the final command. Open `/api/v1/health` to check D1 connectivity, then pair two fresh browser profiles and confirm that a move appears on the second device. Preview data is for testing. The production migration and release are separate operations.

Netlify can also serve the UI from the normal `npm run build` output in `dist/client`. A Netlify static preview supports local play, puzzle URLs, and the in-progress library. Device pairing and remote saves need the Cloudflare Worker and D1 deployment.
