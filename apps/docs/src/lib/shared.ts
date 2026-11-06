import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'neat';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'Arnab-Afk',
  repo: 'ethglobalmumbai',
  branch: 'main',
  // The docs live in a monorepo subfolder, so edit links must include it.
  contentDir: 'apps/docs/content/docs',
};

export const npmUrl = 'https://www.npmjs.com/package/neat3-sdk';

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.png'];

  return { segments, url: getImageUrl(segments, page.locale) };
}
