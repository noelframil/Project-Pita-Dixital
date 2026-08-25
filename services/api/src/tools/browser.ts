import puppeteer from 'puppeteer';

export async function runBrowserAutomation(input: Record<string, unknown>): Promise<string> {
  const url = input.url as string;
  const extractScript = input.extract_script as string;

  if (!url) {
    throw new Error('El parámetro "url" es obligatorio.');
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    if (extractScript) {
      // Ejecutar el script personalizado del LLM en el contexto de la página
      const result = await page.evaluate(extractScript);
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    }

    // Si no hay script, devolvemos el texto plano de la página por defecto
    const textContent = await page.evaluate(() => {
      return document.body.innerText;
    });

    return textContent.slice(0, 8000); // Limitar a 8000 caracteres para no saturar el contexto
  } catch (error: any) {
    return `Error en la automatización del navegador: ${error.message}`;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
