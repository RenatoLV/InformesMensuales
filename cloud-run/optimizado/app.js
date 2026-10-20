const crypto = require('node:crypto');
const {transparenciaSegura} = require('./privacidad');

/** Inyección de Drive y reloj para verificar sin generar archivos reales. */
function crearServicio({drive, renderHTML, apiKey, maxActivas = 3, ttlMs = 120000, maxCacheBytes = 32 * 1024 * 1024, now = Date.now}) {
  if (!apiKey) throw new Error('API_KEY es obligatoria');
  const pendientes = new Map(), cache = new Map();
  let activas = 0, bytesCache = 0;
  const eliminar = key => { const value = cache.get(key); if (value) bytesCache -= value.bytes; cache.delete(key); };
  function autorizado(key) {
    if (typeof key !== 'string') return false;
    const a = Buffer.from(key), b = Buffer.from(apiKey);
    return a.length === b.length && crypto.timingSafeEqual(a,b);
  }
  async function generar(datos, operationId) {
    const {docIdRemu, docIdTransp} = datos || {};
    const html = datos && datos.documentosHTML;
    const valido = html ? html.motor === 'HTML' && typeof renderHTML === 'function' &&
      [html.remuneraciones,html.transparencia].every(d => d && typeof d === 'object' && !Array.isArray(d)) :
      [docIdRemu,docIdTransp].every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{10,200}$/.test(id));
    if (!valido ||
        typeof operationId !== 'string' || !/^[a-zA-Z0-9_-]{8,150}$/.test(operationId)) {
      const error = new Error('Identificadores inválidos'); error.status = 400; throw error;
    }
    for (const [key,value] of cache) if (value.expira <= now()) eliminar(key);
    const firma = crypto.createHash('sha256').update(JSON.stringify(html || [docIdRemu,docIdTransp])).digest('hex');
    const anterior = cache.get(operationId) || pendientes.get(operationId);
    if (anterior) {
      if (anterior.firma !== firma) { const error = new Error('Operación usada con otros documentos'); error.status = 409; throw error; }
      return anterior.resultado || anterior.promesa;
    }
    if (activas >= maxActivas) { const error = new Error('OCUPADO: intente más tarde'); error.status = 429; throw error; }
    activas++;
    const promesa = (async () => {
      const exportar = async fileId => {
        const respuesta = await drive.files.export({fileId, mimeType:'application/pdf'},
          {responseType:'arraybuffer', timeout:60000, retry:false});
        const buffer = Buffer.from(respuesta.data);
        if (buffer.length > 10 * 1024 * 1024) throw new Error('PDF demasiado grande');
        return buffer.toString('base64');
      };
      // Esperar ambos resultados incluso ante fallo: mantiene el límite real de exportaciones.
      const generarHTML = async d => {
        const buffer = Buffer.from(await renderHTML(d));
        if (buffer.length > 10 * 1024 * 1024 || buffer.subarray(0,5).toString() !== '%PDF-') throw new Error('PDF HTML inválido');
        return buffer.toString('base64');
      };
      // Un solo PDF activo por generación HTML: reduce el pico de RAM y CPU de Chromium.
      const respuestas = html ? [
        {status:'fulfilled',value:await generarHTML({...html.remuneraciones,transparencia:false})},
        {status:'fulfilled',value:await generarHTML(transparenciaSegura(html.remuneraciones,html.transparencia))}
      ] : await Promise.allSettled([exportar(docIdRemu),exportar(docIdTransp)]);
      const fallo = respuestas.find(r => r.status === 'rejected');
      if (fallo) throw fallo.reason;
      const resultado = {exito:true, pdfRemuBase64:respuestas[0].value, pdfTranspBase64:respuestas[1].value};
      // Base64 es ASCII: evitar construir otra copia JSON de ambos PDF solo para medirla.
      const bytes = resultado.pdfRemuBase64.length + resultado.pdfTranspBase64.length + 64;
      if (bytes <= maxCacheBytes) {
        while (bytesCache + bytes > maxCacheBytes && cache.size) eliminar(cache.keys().next().value);
        cache.set(operationId,{firma,resultado,bytes,expira:now()+ttlMs}); bytesCache += bytes;
      }
      return resultado;
    })();
    pendientes.set(operationId,{firma,promesa});
    try { return await promesa; } finally { pendientes.delete(operationId); activas--; }
  }
  return {autorizado,generar};
}
module.exports = {crearServicio};
