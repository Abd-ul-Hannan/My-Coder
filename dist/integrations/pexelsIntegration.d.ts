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
export declare class PexelsClient {
    private readonly apiKey;
    private readonly baseUrl;
    constructor(apiKey: string);
    /**
     * Searches Pexels for photos matching a query.
     *
     * @param query      - Search term, e.g. "technology workspace"
     * @param perPage    - Number of results (1–80)
     * @param orientation - Optional: 'landscape' | 'portrait' | 'square'
     */
    searchPhotos(query: string, perPage?: number, orientation?: 'landscape' | 'portrait' | 'square'): Promise<PexelsSearchResponse>;
    /**
     * Generates a React img tag snippet for a Pexels photo.
     * Includes photographer attribution comment.
     */
    static toReactImgTag(photo: PexelsPhoto, className?: string): string;
    /**
     * Generates an HTML img tag for a Pexels photo.
     */
    static toHtmlImgTag(photo: PexelsPhoto, classes?: string): string;
}
//# sourceMappingURL=pexelsIntegration.d.ts.map