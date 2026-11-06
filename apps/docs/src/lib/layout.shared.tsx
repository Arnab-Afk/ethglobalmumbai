import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig, npmUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // Lowercase text wordmark, no logo mark (DESIGN.md, Header).
      title: (
        <span className="flex items-baseline gap-2">
          <span className="text-[18px] font-extrabold tracking-[-0.03em]">{appName}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#8a847e]">docs</span>
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [{ text: 'npm ↗', url: npmUrl, external: true }],
    themeSwitch: { enabled: false },
  };
}
