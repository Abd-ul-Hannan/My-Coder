// src/integrations/pexelsIntegration.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pexels Stock Photo Integration
//
// Searches Pexels for relevant photos and returns:
//   - Direct image URLs for embedding in generated code
//   - Formatted React/HTML <img> code snippets
//   - Tailwind-ready img tags with alt text
// ─────────────────────────────────────────────────────────────────────────────

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographerUrl: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
  };
  alt: string;
}

export interface PexelsSearchResponse {
  photos: PexelsPhoto[];
  totalResults: number;
  page: number;
  perPage: number;
}

// ─── PexelsClient ──────────────────────────────────────────────────────────────

export class PexelsClient {
  private readonly baseUrl = 'https://api.pexels.com/v1';

  constructor(private readonly apiKey: string) {}

  /**
   * Searches Pexels for photos matching a query.
   *
   * @param query      - Search term, e.g. "technology workspace"
   * @param perPage    - Number of results (1–80)
   * @param orientation - Optional: 'landscape' | 'portrait' | 'square'
   */
  async searchPhotos(
    query: string,
    perPage = 6,
    orientation?: 'landscape' | 'portrait' | 'square',
  ): Promise<PexelsSearchResponse> {
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

    const data = await response.json() as {
      photos: Array<{
        id: number; width: number; height: number; url: string;
        photographer: string; photographer_url: string; alt: string;
        src: { original: string; large2x: string; large: string; medium: string; small: string };
      }>;
      total_results: number; page: number; per_page: number;
    };

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
  static toReactImgTag(photo: PexelsPhoto, className?: string): string {
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
  static toHtmlImgTag(photo: PexelsPhoto, classes?: string): string {
    return `<!-- Photo by ${photo.photographer} on Pexels -->
<img
  src="${photo.src.large}"
  alt="${photo.alt}"
  loading="lazy"
  ${classes ? `class="${classes}"` : ''}
/>`;
  }
}
