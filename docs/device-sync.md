# Device sync and Cloudflare previews

On your first device, open **Options → Device sync → Set up new sync**. On the other device, choose **Scan QR code**, point the camera at the first device’s code, then choose **Link this device**. You can also choose a QR photo or open the pairing link. The code and link expire after ten minutes and can be used once. To add another device later, choose **Link another device**. If you lose access to your linked devices, choose **Scan QR code → Use a recovery key** and enter the key you saved at setup.

The sync entry page is `/sync`. Scanning, recovery, confirmation, invitations, and linked devices each have a URL under it. Back and Forward follow those steps. Reloading an invitation in the same tab keeps its original expiry. The camera advances to confirmation once the same code has stayed in view for half a second. A selected photo opens confirmation as soon as it decodes.

Linking combines completed puzzles and puzzles in progress from both devices. Each independent attempt keeps its own URL, even when two attempts use the same grid. If both devices changed the same attempt, sync keeps a conflict copy. Home shows in-progress puzzles by most recent play. Puzzle sharing gives the recipient their own attempt. A device already linked to a separate library cannot join a second library directly.

Settings sync includes appearance, highlighting, controls, error checking, timing, puzzle defaults, hints, solver order, and keyboard shortcuts. On first sync, a device contributes its custom choices wherever the library has no saved choice. Existing library choices win a disagreement. After linking, edits merge by setting. When both devices change the same setting offline, the last edit received by the server wins. Panel arrangement, active input tools, and downloaded collections stay on each device.

Changes are saved locally first. The first unsynced edit starts a one-minute timer. Later edits share that upload. Pausing, finishing, switching puzzles, or backgrounding the app can send pending changes sooner. Elapsed time is included with puzzle saves and does not trigger periodic uploads on its own. Use **Puzzle options → Sync now** to send the current puzzle immediately and check its cloud save. Routine status appears in that menu. If pending changes are offline or fail to sync, the puzzle card shows their status. Failed uploads retry with backoff while the app is open.

A WebSocket notifies linked devices when puzzles, settings, or the device list change. Devices still check for missed changes on focus, reconnect, and about every five minutes while visible. When the WebSocket is unavailable, visible devices check about every 30 seconds. In **Linked devices**, tap **⋯** on mobile to rename or unlink a device. Clearing a name restores its generated label.

## Run locally

From the repository root, build the client with the Rust WebAssembly target installed. Wrangler serves the client and sync API through Pages. A second Worker hosts the Durable Object that forwards WebSocket notifications.

```sh
npm ci
npm run build:cloudflare
npx wrangler@4 d1 migrations apply DB --local
```

Run the notification Worker in one terminal and Pages in another.

```sh
npx wrangler@4 dev --config cloudflare/wrangler.sync-events.jsonc --port 8790
```

```sh
npx wrangler@4 pages dev
```

For UI iteration, leave Pages dev on port 8788 and run `npm run dev` in another terminal. Open `http://127.0.0.1:8766/sync`. Vite hot-reloads the interface and forwards sync requests to the local Worker. Use the HTTPS branch preview to pair a physical phone with a computer.

## Preview a pull request

This repository deploys the static app and its Worker together to the Direct Upload Pages project `klyn-sudoku`. Branch previews share the `sudoku-sync-preview` D1 database through the `DB` binding in `env.preview`. The Pages configuration binds to the `klyn-sudoku-sync-events` Worker in both environments. Deploy that Worker once before the first Pages deployment with the new binding. Notifications are scoped by library ID, and the preview and production libraries live in separate D1 databases. Apply pending preview migrations before uploading a branch build. Use the branch alias to test across updates so the browser retains its device credentials.

```sh
npx wrangler@4 deploy --config cloudflare/wrangler.sync-events.jsonc
npm run build:cloudflare
npx wrangler@4 d1 migrations apply DB --env preview --remote
npx wrangler@4 pages deploy dist/client --project-name klyn-sudoku --branch codex/accountless-device-sync
```

Substitute the pull request's head branch in the final command. Open `/api/v1/health` to check D1 connectivity, then pair two fresh browser profiles and confirm that a move appears on the second device without refreshing the page. Preview data is for testing. The production migration and release are separate operations.

Netlify can also serve the UI from the normal `npm run build` output in `dist/client`. A Netlify static preview supports local play, puzzle URLs, and the in-progress library. Device pairing and remote saves need the Cloudflare Worker and D1 deployment.
