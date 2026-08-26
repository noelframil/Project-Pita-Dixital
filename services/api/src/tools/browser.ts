import puppeteer from 'puppeteer';

export async function runBrowserAutomation(input: Record<string, unknown>): Promise<string> {
  const action = input.action as string || 'navigate';
  const url = input.url as string;
  const selector = input.selector as string;
  const text = input.text as string;
  const extractScript = input.extract_script as string;

  if (action === 'navigate' && !url) {
    throw new Error('El parámetro "url" es obligatorio para navigate.');
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const page = await browser.newPage();
    if (url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }

    if (action === 'click' && selector) {
      await page.click(selector);
      await new Promise(r => setTimeout(r, 1000)); // wait for transitions
      return `Clickeado en ${selector} exitosamente.`;
    }

    if (action === 'type' && selector && text) {
      await page.type(selector, text);
      return `Texto escrito en ${selector} exitosamente.`;
    }

    if (action === 'screenshot') {
      const b64 = await page.screenshot({ encoding: 'base64' });
      return `[SCREENSHOT_BASE64_GENERATED] Length: ${b64.length}. (En un entorno completo multimodal esto se inyectaría como imagen).`;
    }

    if (extractScript) {
      // Ejecutar el script personalizado del LLM en el contexto de la página
      const result = await page.evaluate(extractScript);
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    }

    // Si no hay script, devolvemos un volcado estructurado del DOM interactivo
    const domDump = await page.evaluate(() => {
      const interactables = Array.from(document.querySelectorAll('a, button, input, select, textarea')).map((el: any) => {
        return { tag: el.tagName, text: el.innerText || el.value || el.placeholder || '', id: el.id, class: el.className };
      });
      // @ts-ignore
      return JSON.stringify({ url: window.location.href, text: document.body.innerText.substring(0, 3000), elements: interactables.slice(0, 50) });
    });

    return domDump;
  } catch (error: any) {
    return `Error en la automatización del navegador: ${error.message}`;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
