export interface SearchResult {
    title: string;
    url: string;
    content: string;
    score: number;
    publishedDate?: string;
}
export interface SearchResponse {
    answer?: string;
    results: SearchResult[];
    query: string;
    searchDepth: 'basic' | 'advanced';
}
export interface ExtractResult {
    url: string;
    content: string;
    title?: string;
}
export declare class TavilySearchAgent {
    private readonly apiKey;
    private readonly baseUrl;
    constructor(apiKey: string);
    /**
     * Searches the web and returns ranked results with an AI-synthesized answer.
     *
     * @param query       - Search query string
     * @param maxResults  - Number of results to return (default 5)
     * @param depth       - 'basic' for speed, 'advanced' for deeper research
     */
    search(query: string, maxResults?: number, depth?: 'basic' | 'advanced'): Promise<SearchResponse>;
    /**
     * Extracts clean text content from one or more URLs.
     * Useful for @url: context references.
     */
    extractContent(urls: string[]): Promise<ExtractResult[]>;
    /**
     * Formats search results as a markdown string for injection into AI context.
     */
    static formatResultsAsMarkdown(response: SearchResponse): string;
}
//# sourceMappingURL=webSearchAgent.d.ts.map