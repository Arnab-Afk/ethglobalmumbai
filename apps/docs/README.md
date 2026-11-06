# neat docs

Documentation site for [`neat3-sdk`](https://www.npmjs.com/package/neat3-sdk), built with [Fumadocs](https://fumadocs.dev) on Next.js. It follows the landing page's design system, [`frontend/DESIGN.md`](../../frontend/DESIGN.md): light, lavender, Manrope and Geist Mono.

## Run

```sh
npm install
npm run dev -- -p 3001   # the app in ../../frontend uses 3000
npm run build            # also compiles every MDX page, so it catches broken content
npm run types:check
```

## Where things are

| Path | What |
|---|---|
| `content/docs/` | The pages, as MDX. Folders are sidebar groups; each has a `meta.json` for title and order |
| `src/app/page.tsx` | The landing page at `/` |
| `src/components/landing/` | Landing sections. `section.tsx` and `shapes.tsx` are copies of the frontend's |
| `src/components/docs-banner.tsx` | The lavender header on every doc page |
| `src/app/global.css` | DESIGN.md tokens mapped onto the Fumadocs theme variables |
| `src/lib/shared.ts` | App name, repo and npm links |

## Writing a page

Add `content/docs/<section>/<name>.mdx` with `title` and `description` front matter, then list it in that folder's `meta.json`. The first path segment becomes the mono label on the banner.

Follow DESIGN.md: sentence case, plain words, no invented figures. Anything that can go stale (network timings, addresses) carries its date. Keep the caveats that are in the existing pages: the alt-mempool is public, and the devnet and demo tokens have no value.

## Known issues

- `npm run lint` fails: `eslint-config-next` pulls in a `typescript-eslint` that does not support the TypeScript 7 this scaffold installs. Pin `typescript` to 5.x to run it.
