# Testing a Netlify (or Vercel) deploy preview

Keep your redirect map in production URLs and point the requests at the preview with
`--host-rewrite`. The report keeps showing production URLs.

```sh
npx redirect-guard redirects.csv \
  --host-rewrite https://www.example.com=https://deploy-preview-42--example.netlify.app
```

Notes:

- Rules in `_redirects` or `netlify.toml` (Vercel: `vercel.json` `redirects`) apply on
  previews too, so this tests the real rules before they reach production.
- If your redirects point at absolute production URLs (`https://www.example.com/new`), the
  `Location` on the preview is already in production space and is requested on the preview
  host through the same rewrite.
- Previews usually send `X-Robots-Tag: noindex`. That makes every destination fail
  `target-noindex`. Skip indexability on previews and keep it for production:

  ```sh
  npx redirect-guard redirects.csv --no-indexability \
    --host-rewrite https://www.example.com=https://deploy-preview-42--example.netlify.app
  ```

- Password-protected previews: put `user:pass` in a secret and pass `--auth-env NAME`. The
  credentials are sent only to the preview host and the origins in your map.
- In GitHub Actions, the preview URL is usually available from the deploy step's output or
  a deployment status event; pass it in an environment variable.
