"use strict";
// src/integrations/pexelsIntegration.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pexels Stock Photo Integration
//
// Searches Pexels for relevant photos and returns:
//   - Direct image URLs for embedding in generated code
//   - Formatted React/HTML <img> code snippets
//   - Tailwind-ready img tags with alt text
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.PexelsClient = void 0;
// ─── PexelsClient ──────────────────────────────────────────────────────────────
class PexelsClient {
    apiKey;
    baseUrl = 'https://api.pexels.com/v1';
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    /**
     * Searches Pexels for photos matching a query.
     *
     * @param query      - Search term, e.g. "technology workspace"
     * @param perPage    - Number of results (1–80)
     * @param orientation - Optional: 'landscape' | 'portrait' | 'square'
     */
    async searchPhotos(query, perPage = 6, orientation) {
        const params = new URLSearchParams({
            query,
            per_page: String(perPage),
            ...(orientation ? { orientation } : {}),
        });
        const response = await fetch(`${this.baseUrl}/search?${params}`, {
            headers: { Authorization: this.apiKey },
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
            throw new Error(`Pexels API error: HTTP ${response.status}`);
        }
        const data = await response.json();
        return {
            totalResults: data.total_results,
            page: data.page,
            perPage: data.per_page,
            photos: data.photos.map(p => ({
                id: p.id, width: p.width, height: p.height,
                url: p.url, photographer: p.photographer,
                photographerUrl: p.photographer_url, alt: p.alt, src: p.src,
            })),
        };
    }
    /**
     * Generates a React img tag snippet for a Pexels photo.
     * Includes photographer attribution comment.
     */
    static toReactImgTag(photo, className) {
        const cls = className ? ` className="${className}"` : ` className="w-full h-full object-cover"`;
        return [
            `{/* Photo by ${photo.photographer} on Pexels */}`,
            `<img`,
            `  src="${photo.src.large}"`,
            `  srcSet="${photo.src.medium} 768w, ${photo.src.large} 1200w, ${photo.src.large2x} 2400w"`,
            `  alt="${photo.alt}"`,
            `  loading="lazy"`,
            `  width={${photo.width}}`,
            `  height={${photo.height}}`,
            `${cls}`,
            `/>`,
        ].join('\n');
    }
    /**
     * Generates an HTML img tag for a Pexels photo.
     */
    static toHtmlImgTag(photo, classes) {
        return `<!-- Photo by ${photo.photographer} on Pexels -->
<img
  src="${photo.src.large}"
  alt="${photo.alt}"
  loading="lazy"
  ${classes ? `class="${classes}"` : ''}
/>`;
    }
}
exports.PexelsClient = PexelsClient;
//# sourceMappingURL=pexelsIntegration.js.map