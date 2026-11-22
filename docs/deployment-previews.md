# Preview deployments

## Recommendation

Use Cloudflare Pages for app previews. The GitHub Actions workflow can deploy a pull request to a stable `pr-<number>` URL. It also deploys the app and its sync Worker together.

The workflow does not deploy a preview during its automatic pull request run. That run builds the app and runs checks. Start a separate workflow run to deploy the preview.

Netlify can build a preview automatically when its Git integration can read the repository. Its current setup publishes the static app. It does not deploy the Cloudflare sync Worker or D1 database. Earlier Netlify deploys in this repository failed during checkout with HTTP 403. Use Netlify after its repository access works again.

## Deploy a Cloudflare preview

1. Open [Actions → Cloudflare Pages](https://github.com/coder13/sudoku-app/actions/workflows/cloudflare-pages.yml).
2. Select **Run workflow** on the `main` branch.
3. Enter the number of an open pull request from this repository.
4. Wait for the run to finish. Open its summary and follow the preview link.
5. After you push new commits, run the workflow again with the same pull request number.

The workflow deploys the pull request's current head commit to the `pr-<number>` Pages branch. The preview uses the existing preview D1 database and sync Worker. Apply preview migrations before you test a change that needs them. See [device sync and Cloudflare previews](device-sync.md#preview-a-pull-request).

The automatic pull request workflow only builds and checks the code. It does not need Cloudflare credentials. The manual deploy uses the `CLOUDFLARE_API_TOKEN` Actions secret and `CLOUDFLARE_ACCOUNT_ID` Actions variable.

## Use a Netlify preview

Netlify uses its Git integration. It is not a GitHub Actions workflow. When the integration can read the repository, it creates a Deploy Preview for an open pull request against `main`.

1. Open the pull request in GitHub.
2. Wait for the Netlify Deploy Preview status or comment.
3. Open the preview URL from that status or comment.

The usual URL format is `https://deploy-preview-<number>--coder13-sudoku.netlify.app`. Netlify uses `netlify.toml` to build the static app and set preview environment values. If Netlify does not create a preview, open the deploy record in Netlify and read the checkout or build error. For an HTTP 403 checkout error, restore the Netlify GitHub app's access to this repository.

Use a Netlify preview to review the static interface. Use a Cloudflare preview to test device sync, remote saves, or Worker behavior.

## References

- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare Pages preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Netlify Deploy Previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/)
