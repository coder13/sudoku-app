# Device sync and Cloudflare previews

On your first device, open **Options → Device sync → Set up new sync**. On the other device, choose **Scan QR code**, point the camera at the first device’s code, then choose **Link this device**. You can also choose a QR photo or open the pairing link. The code and link expire after ten minutes and can be used once. To add another device later, choose **Link another device**. If you lose access to your linked devices, choose **Scan QR code → Use a recovery key** and enter the key you saved at setup.

Linking combines completed puzzles and puzzles in progress from both devices. Each independent attempt keeps its own URL, even when two attempts use the same grid. If both devices changed the same attempt, sync keeps a conflict copy. Home shows in-progress puzzles by most recent play. Puzzle sharing gives the recipient their own attempt. A device already linked to a separate library cannot join a second library directly.

Settings sync includes appearance, highlighting, controls, error checking, timing, puzzle defaults, hints, solver order, and keyboard shortcuts. On first sync, a device contributes its custom choices wherever the library has no saved choice. Existing library choices win a disagreement. After linking, edits merge by setting. When both devices change the same setting offline, the last edit received by the server wins. Panel arrangement, active input tools, and downloaded collections stay on each device.

Changes are saved locally first. Linked devices check for changes on focus, on reconnect, and every five seconds while visible. In **Linked devices**, tap **⋯** on mobile to rename or unlink a device. Clearing a name restores its generated label.

## Run locally

From the repository root, build the client with the Rust WebAssembly target installed. Wrangler serves both the client and the sync Worker.

```sh
npm ci
npm run build:cloudflare
npx wrangler@4 d1 migrations apply DB --local
npx wrangler@4 pages dev
```

For UI iteration, leave Pages dev on port 8788 and run `npm run dev` in a second terminal. Open `http://127.0.0.1:8766/sync`. Vite hot-reloads the interface and forwards sync requests to the local Worker. Use the HTTPS branch preview to pair a physical phone with a computer.

## Preview a pull request

This repository deploys the static app and its Worker together to the Direct Upload Pages project `klyn-sudoku`. Branch previews share the `sudoku-sync-preview` D1 database through the `DB` binding in `env.preview`. Apply pending preview migrations before uploading a branch build. Use the branch alias to test across updates so the browser retains its device credentials.

```sh
npm run build:cloudflare
npx wrangler@4 d1 migrations apply DB --env preview --remote
npx wrangler@4 pages deploy dist/client --project-name klyn-sudoku --branch codex/accountless-device-sync
```

Substitute the pull request's head branch in the final command. Open `/api/v1/health` to check D1 connectivity, then pair two fresh browser profiles and confirm that a move appears on the second device. Preview data is for testing. The production migration and release are separate operations.

Netlify can also serve the UI from the normal `npm run build` output in `dist/client`. A Netlify static preview supports local play, puzzle URLs, and the in-progress library. Device pairing and remote saves need the Cloudflare Worker and D1 deployment.
