import * as cheerio from 'cheerio';

export async function webSearch(input: Record<string, unknown>): Promise<string> {
  const query = input.query as string;
  if (!query) throw new Error('Missing query parameter');

  // Using DuckDuckGo html search
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });

  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const results: string[] = [];
  $('.result').each((i, el) => {
    if (i >= 5) return; // Top 5 results
    const title = $(el).find('.result__title').text().trim();
    const snippet = $(el).find('.result__snippet').text().trim();
    const url = $(el).find('.result__url').attr('href');
    results.push(`Título: ${title}\nURL: ${url}\nResumen: ${snippet}\n`);
  });

  if (results.length === 0) return 'No se encontraron resultados.';
  return results.join('\n---\n');
}

export async function webFetch(input: Record<string, unknown>): Promise<string> {
  const url = input.url as string;
  if (!url) throw new Error('Missing url parameter');

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove scripts, styles, etc.
  $('script, style, noscript, iframe, img, svg').remove();

  const text = $('body').text()
    .replace(/\s+/g, ' ')
    .trim();

  return text.substring(0, 4000); // Limit to 4000 chars
}
