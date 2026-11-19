# Device sync and Cloudflare previews

On your first device, open **Options → Device sync → Set up new sync**. On the other device, choose **Scan QR code**, point the camera at the first device’s code, then choose **Link this device**. You can also choose a QR photo or open the pairing link. The code and link expire after ten minutes and can be used once. To add another device later, choose **Link another device**. If you lose access to your linked devices, choose **Scan QR code → Use a recovery key** and enter the key you saved at setup.

The sync entry page is `/sync`. Scanning, recovery, confirmation, invitations, and linked devices each have a URL under it. Back and Forward follow those steps. Reloading an invitation in the same tab keeps its original expiry. The camera advances to confirmation once the same code has stayed in view for half a second. A selected photo opens confirmation as soon as it decodes.

Open the same Sudoku site address on both devices when pairing. Both live addresses, `sudoku.klyn.gay` and `klyn-sudoku.pages.dev`, use the same pairing service. For a local UI that pairs with the live app, use the production sync mode below.

Linking combines completed puzzles and puzzles in progress from both devices. Each independent attempt keeps its own URL, even when two attempts use the same grid. If both devices changed the same attempt, sync keeps a conflict copy. Opening the app resumes the current puzzle. **Active Puzzles** shows in-progress puzzles by most recent play. An ordinary `?puzzle=` URL opens the same private attempt on linked devices. **Share puzzle → Create link** creates an unlisted UUID link to the givens and rules. Recipients preview the puzzle and start their own copy, which syncs if their device is linked. A device already linked to a separate library cannot join a second library directly.

Settings sync includes appearance, highlighting, controls, error checking, timing, puzzle defaults, hints, solver order, and keyboard shortcuts. On first sync, a device contributes its custom choices wherever the library has no saved choice. Existing library choices win a disagreement. After linking, edits merge by setting. When both devices change the same setting offline, the last edit received by the server wins. Panel arrangement, active input tools, and downloaded collections stay on each device.

The app opens a saved puzzle and reads saved settings from this browser first. The puzzle stays open while the app checks the cloud. The puzzle card shows a spinner during the puzzle check. The wordmark shows a separate spinner during account sync. If you open an uncached private puzzle link at startup, sync requests that puzzle first.

The app also keeps a local copy of the linked-device list. The Device sync page shows the saved list while it checks the cloud. If the app cannot connect, the saved puzzle, settings, and device list stay available. A reload keeps the play state in this tab. A new visit uses the saved pause-on-open setting. An explicit pause or resume still syncs.

Use the palette icon on the puzzle card to open Colors and Chains. A reload restores the open tools and chain drawing mode in this tab. The puzzle save includes chain links and the selected endpoint. An app update uses the same saved state.

Changes are saved locally first. Edits share an upload about two seconds after the most recent edit. If edits continue without a break, the app uploads about a minute after the first unsynced edit. Pausing, resuming, or solving a puzzle sends changes right away. Switching puzzles or backgrounding the app can also send pending changes sooner. Elapsed time is included with puzzle saves and does not trigger periodic uploads on its own. Use **Puzzle options → Sync now** to send the current puzzle immediately and check its cloud save. The menu shows saves in progress and sync warnings. If pending changes are offline or fail to sync, the puzzle card shows their status. Failed uploads retry with backoff while the app is open.

A green dot beside the Sudoku wordmark confirms the live connection. The puzzle card shows a device icon when another linked device has the same puzzle open. When another device starts or opens a different active puzzle, choose **Catch up** to open that puzzle here. If live sync is reconnecting, puzzle saves can still sync through periodic cloud checks.

A WebSocket notifies linked devices when puzzles, settings, or the device list change. The same connection shares which puzzle is visible. That information expires when a device leaves or disconnects. Devices still check for missed changes on focus, reconnect, and about every five minutes while visible. When the WebSocket is unavailable, visible devices check about every 30 seconds. In **Linked devices**, tap **⋯** on mobile to rename or unlink a device. Clearing a name restores its generated label.

## Run locally

From the repository root, build the client with the Rust WebAssembly target installed. Wrangler serves the client and sync API through Pages. A second Worker hosts the Durable Object that forwards WebSocket notifications.

```sh
npm ci
npm run build:cloudflare
npx wrangler d1 migrations apply DB --local
```

Run the notification Worker in one terminal and Pages in another.

```sh
npx wrangler dev --config cloudflare/wrangler.sync-events.jsonc --port 8790
```

```sh
npx wrangler pages dev
```

For UI iteration, leave Pages dev on port 8788 and run `npm run dev` in another terminal. Open `http://127.0.0.1:8766/sync`. Vite hot-reloads the interface and forwards sync requests to the local Worker. Use the HTTPS branch preview to pair a physical phone with a computer.

## Test the local UI with production sync

```sh
npm run dev:prod-sync
```

On the Mac, open `http://127.0.0.1:8768/sync`. On your linked device, open [the live Sudoku app](https://sudoku.klyn.gay/sync) and choose **Link another device**. Scan that code in the local app and confirm the link. Use the same local address on subsequent visits to retain this browser's device credentials.

Vite serves the UI locally and forwards sync requests to the deployed Pages Worker. This mode uses the production library, so puzzle and settings edits sync to your linked devices. The dedicated port keeps this browser's local saves and credentials separate from the ordinary dev server.

## Preview a pull request

The [Cloudflare Pages workflow](../.github/workflows/cloudflare-pages.yml) builds the static app and its sync Worker together on pull requests from branches in this repository. Open the run summary for the `pr-<number>.klyn-sudoku.pages.dev` link. Use that same address to pair two fresh browser profiles and confirm that a move appears on the second device without refreshing the page. The preview URL stays the same across pushes so each browser retains its device credentials.

Previews share the `sudoku-sync-preview` D1 database through the `DB` binding in `env.preview`. The preview and production Pages deployments bind to the existing `klyn-sudoku-sync-events` Worker. It scopes notifications by library ID. Apply pending preview migrations before testing a branch that needs them.

```sh
npx wrangler d1 migrations apply sudoku-sync-preview --env preview --remote
```

## Release to production

A push to `main` builds and publishes to [sudoku.klyn.gay](https://sudoku.klyn.gay). The workflow checks `/api/v1/health` after each deployment. It uses the `CLOUDFLARE_ACCOUNT_ID` GitHub Actions variable and the `CLOUDFLARE_API_TOKEN` Actions secret with Cloudflare Pages Edit permission.

For a release that changes the database schema, apply the migration before merging the code that requires it. Keep the migration compatible with the live version during the rollout. Run the migration with a local Wrangler login with D1 access.

```sh
npx wrangler d1 migrations apply sudoku-sync-prod --remote
```

When the notification Worker changes, deploy it separately with `npx wrangler deploy --config cloudflare/wrangler.sync-events.jsonc`.

To retry a release, run **Cloudflare Pages** from the Actions tab and select `main`.

Netlify can also serve the UI from the normal `npm run build` output in `dist/client`. A Netlify static preview supports local play, puzzle URLs, and the in-progress library. Device pairing and remote saves need the Cloudflare Worker and D1 deployment.
