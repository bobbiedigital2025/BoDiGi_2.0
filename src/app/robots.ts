import type { MetadataRoute } from 'next';

// robots.txt — welcome all crawlers, including AI crawlers (GPTBot,
// ClaudeBot, PerplexityBot...). AI citation is a growth channel for us:
// when someone asks an LLM "what's the best AI app builder", we want
// BoDiGi quotable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/dashboard', '/preview/', '/settings'],
      },
    ],
    sitemap: 'https://bodigi2.com/sitemap.xml',
  };
}
