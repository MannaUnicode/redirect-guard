# Contributing to redirect-guard

Thanks for helping. Bug reports with a reproducible case are as valuable as code.

## Setup

```sh
npm ci
npm test            # node:test, against a local HTTP server; no network access
npm run typecheck   # checks types/index.d.ts against types/check.ts
npm run demo        # the sample output shown in the README
```

Node.js 20.3 or later is required. CI runs Node 20, 22 and 24 on Linux, plus Windows and
macOS on Node 22.

## Ground rules

- **Zero runtime dependencies.** Only `node:` built-ins. A test enforces this. Dev
  dependencies need a good reason; today there is only `typescript` for the type check.
- **No network in tests.** Use `test/helpers/fixture-server.js` (a `node:http` server on
  `127.0.0.1:0`, with `localhost` as a second host) or an injected `fetch` for DNS/TLS
  failures.
- **No telemetry**, no calls to anything the user did not ask for.
- **Plain JavaScript (ESM) with JSDoc.** Public types live in `types/index.d.ts`; update them
  together with `src/index.js`.
- **Honest wording.** SEO facts are hedged ("Google may treat..."), and nothing in docs or
  output claims more than the tool checks.

## Adding a rule

1. Add the id, default severity, description and (for errors) a one-line hint to
   `src/checks/rules.js`. New rules default to `warn` or `off` (a new `error` rule is a
   breaking change, see the versioning section in `docs/configuration.md`).
2. Emit the issue from the right place: `src/checks/evaluate.js` (single entry),
   `src/checks/chain.js` (chain-level) or `src/checks/heuristics.js` (cross-entry).
3. Add the id to `types/index.d.ts` (`RuleId`) and `schema/config.schema.json`.
4. Write a section in `docs/rules.md` with the id as its heading: why it matters, how to fix
   it, how to disable it.
5. Add tests where the rule fires **and** where it does not (`test/rules.test.js`).

## Pull requests

- Keep changes focused; one topic per PR.
- Update `CHANGELOG.md` under "Unreleased".
- Text and Markdown output are not part of the public contract, but the README sample is
  checked against `npm run demo`: re-run `NO_COLOR=1 npm run demo` and paste the output
  between the `demo:start` and `demo:end` markers if your change affects it.

## Releases (maintainers)

Bump the version in `package.json`, move the "Unreleased" notes to a new version section in
`CHANGELOG.md`, commit, and push a `vX.Y.Z` tag. The release workflow runs the tests,
checks that the tag matches `package.json` and publishes to npm with provenance.

By contributing you agree that your contributions are licensed under the MIT License and
that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
