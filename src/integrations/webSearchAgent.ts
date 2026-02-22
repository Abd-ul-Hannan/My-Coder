// src/integrations/webSearchAgent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Web Search & Content Extraction via Tavily API
//
// Features:
//   - Full web search with ranked results
//   - URL content extraction
//   - Answer synthesis (Tavily's "answer" field)
//   - Used by /search command and @url: context references
// ─────────────────────────────────────────────────────────────────────────────

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

// ─── TavilySearchAgent ───────────────────────────────────────────────────────

export class TavilySearchAgent {
  private readonly baseUrl = 'https://api.tavily.com';

  constructor(private readonly apiKey: string) {}

  /**
   * Searches the web and returns ranked results with an AI-synthesized answer.
   *
   * @param query       - Search query string
   * @param maxResults  - Number of results to return (default 5)
   * @param depth       - 'basic' for speed, 'advanced' for deeper research
   */
  async search(
    query: string,
    maxResults = 5,
    depth: 'basic' | 'advanced' = 'basic',
  ): Promise<SearchResponse> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: maxResults,
        search_depth: depth,
        include_answer: true,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed: HTTP ${response.status}`);
    }

    const data = await response.json() as {
      answer?: string;
      results: Array<{ title: string; url: string; content: string; score: number; published_date?: string }>;
      query: string;
    };

    return {
      answer: data.answer,
      query: data.query,
      searchDepth: depth,
      results: data.results.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content.slice(0, 1000),
        score: r.score,
        publishedDate: r.published_date,
      })),
    };
  }

  /**
   * Extracts clean text content from one or more URLs.
   * Useful for @url: context references.
   */
  async extractContent(urls: string[]): Promise<ExtractResult[]> {
    const response = await fetch(`${this.baseUrl}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey, urls }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Tavily extract failed: HTTP ${response.status}`);
    }

    const data = await response.json() as {
      results: Array<{ url: string; raw_content: string; title?: string }>
    };

    return data.results.map(r => ({
      url: r.url,
      content: r.raw_content.slice(0, 5000),
      title: r.title,
    }));
  }

  /**
   * Formats search results as a markdown string for injection into AI context.
   */
  static formatResultsAsMarkdown(response: SearchResponse): string {
    const lines = [
      `## 🔍 Search: "${response.query}"`,
      '',
    ];

    if (response.answer) {
      lines.push(`**Summary:** ${response.answer}`, '');
    }

    for (const r of response.results) {
      lines.push(`### [${r.title}](${r.url})`);
      if (r.publishedDate) lines.push(`*${r.publishedDate}*`);
      lines.push(r.content, '');
    }

    return lines.join('\n');
  }
}
