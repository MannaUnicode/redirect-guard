// Reproducible demo: starts the local fixture server with routes that mimic a
// typical migration, then runs the CLI against it with a host rewrite so the
// output shows production URLs. Used to produce the README sample output:
//   NO_COLOR=1 npm run demo
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, redirect, page } from '../test/helpers/fixture-server.js';
import { run } from '../src/cli/main.js';

const srv = await startServer({
  '/robots.txt': { status: 200, headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nAllow: /\n' },
  '/': page(),
  '/chi-siamo': redirect('/about/'),
  '/about/': redirect('/about', 302),
  '/about': page(),
  '/team': page(),
  '/servizi/seo': redirect('/services/seo'),
  '/services/seo': page('<meta name="robots" content="noindex,follow">'),
  '/contatti': redirect('/contact'),
  '/contact': page('<link rel="canonical" href="https://www.example.com/contact">'),
  '/old-promo': page(),
  '/vecchia-pagina': redirect('/new-page'),
  '/new-page': page(),
  '/blog/2019/nuovo-sito/': redirect('/blog/nuovo-sito'),
  '/blog/nuovo-sito': redirect('/blog/nuovo-sito/'),
  '/blog/nuovo-sito/': page(),
  '/blog/old-post': redirect('/'),
  '/shop/categoria-a': redirect('/'),
  '/p/123': redirect('/'),
  '/tag/seo': redirect('/'),
});

const dir = await mkdtemp(join(tmpdir(), 'redirect-guard-demo-'));
await writeFile(
  join(dir, 'redirects.csv'),
  [
    'from,to,status',
    '/chi-siamo,/team,',
    '/servizi/seo,/services/seo,',
    '/contatti,/contact,',
    '/old-promo,,410',
    '/vecchia-pagina,/new-page,',
    '/blog/2019/nuovo-sito/,/blog/nuovo-sito/,',
    '/blog/old-post,,',
    '/shop/categoria-a,,',
    '/p/123,,',
    '/tag/seo,,',
    '',
  ].join('\n'),
);
// A low collapse threshold so the demo shows the grouped warning.
await writeFile(join(dir, 'redirect-guard.config.json'), JSON.stringify({ collapseThreshold: 4, rules: { 'redirect-to-homepage': 'off' } }));

const code = await run(
  [
    'redirects.csv',
    '--base',
    'https://www.example.com',
    '--host-rewrite',
    `https://www.example.com=${srv.origin}`,
    ...process.argv.slice(2),
  ],
  {
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    cwd: dir,
  },
).finally(async () => {
  await srv.close();
  await rm(dir, { recursive: true, force: true });
});
process.exitCode = code === 1 ? 0 : code;
