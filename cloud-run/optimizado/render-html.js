const {crearHTML, campos} = require('../plantilla-html/plantilla');
const fs = require('node:fs');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const ORIGEN_RECURSOS = 'https://pdf-assets.invalid/';
const recursos = new Map();
function prepararRecursos() {
  if (recursos.size === 4) return recursos;
  for (const [name, contentType] of [['Arial-compatible.ttf','font/ttf'],['Arial-compatible-bold.ttf','font/ttf'],
    ['logos.png','image/png'],['pie.png','image/png']]) {
    recursos.set(ORIGEN_RECURSOS + name, {contentType, body:fs.readFileSync(path.join(__dirname,'../plantilla-html/assets',name))});
  }
  return recursos;
}

/** Navegador por proceso; contextos aislados por PDF y cierre incluso cuando falla el render. */
function crearRenderHTML(chromium, {recursosLocales = true, onMetric = () => {}} = {}) {
  let browserPromise;
  return async datos => {
    const inicio = performance.now();
    for (const c of campos) if (datos[c] !== undefined && (typeof datos[c] !== 'string' || datos[c].length > 30000)) {
      const e = new Error('Campo de plantilla inválido'); e.status = 400; throw e;
    }
    if (JSON.stringify(datos).length > 260000) { const e=new Error('Documento demasiado grande');e.status=400;throw e; }
    if (!browserPromise) browserPromise = chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
      .then(browser => {browser.on('disconnected',()=>{browserPromise=undefined;});return browser;})
      .catch(error => {browserPromise=undefined;throw error;});
    const browser = await browserPromise;
    const navegadorListo = performance.now();
    const context = await browser.newContext({offline:true, serviceWorkers:'block'});
    // Límite de toda la operación, no 60 s independientes por cada fase.
    const deadline=setTimeout(()=>{context.close().catch(()=>{});},60000);
    try {
      if (recursosLocales) {
        const fijos = prepararRecursos();
        // Dominio ficticio: las cuatro respuestas salen de RAM; ninguna petición sale a Internet.
        await context.route('**/*', route => {
          const recurso = fijos.get(route.request().url());
          return recurso ? route.fulfill({status:200,...recurso,headers:{'access-control-allow-origin':'*'}}) : route.abort();
        });
      }
      const page = await context.newPage();
      const html = crearHTML(datos, recursosLocales ? {asset:name=>ORIGEN_RECURSOS + name} : {});
      await page.setContent(html,{waitUntil:'load',timeout:60000});
      await page.waitForFunction(()=>window.templateReady || window.templateError,null,{timeout:60000});
      const error = await page.evaluate(()=>window.templateError ||
        (Array.from(document.fonts).some(font=>font.status !== 'loaded') ? 'No se cargaron las fuentes institucionales' : '') ||
        (Array.from(document.images).some(img=>!img.complete || !img.naturalWidth) ? 'No se cargaron las imágenes institucionales' : ''));
      if (error) throw new Error(error);
      const maquetado = performance.now();
      const pdf = await page.pdf({printBackground:true,preferCSSPageSize:true,timeout:60000});
      // Sin formularios, identificadores ni contenido personal en las métricas.
      try { onMetric({evento:'pdf_render',transparencia:datos.transparencia === true,
        navegadorMs:Math.round(navegadorListo-inicio),maquetacionMs:Math.round(maquetado-navegadorListo),
        impresionMs:Math.round(performance.now()-maquetado),totalMs:Math.round(performance.now()-inicio),
        htmlBytes:Buffer.byteLength(html),pdfBytes:pdf.length}); } catch(_) {}
      return pdf;
    } finally {clearTimeout(deadline);await context.close();}
  };
}
module.exports={crearRenderHTML};
