const express = require('express');
// Importar solo Drive evita cargar cientos de APIs en cada arranque frío.
const driveAPI = require('googleapis/build/src/apis/drive');
const {crearServicio} = require('./app');
const {chromium} = require('playwright');
const {crearRenderHTML} = require('./render-html');
const {crearColaGoogle} = require('./cola-google');
const auth = new driveAPI.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/drive.readonly']});
const drive = driveAPI.drive({version:'v3',auth});
const servicio = crearServicio({drive,renderHTML:crearRenderHTML(chromium,{
  // La mejora de recursos requiere medir también arranques fríos en Cloud antes de habilitarla.
  recursosLocales:process.env.PDF_RECURSOS_LOCALES === 'true',
  onMetric:metric=>console.info(JSON.stringify(metric))
}),apiKey:process.env.API_KEY,maxActivas:1});
const app = express();
app.disable('x-powered-by');
app.get('/', (_,res) => res.json({status:'ok',motor:'HTML',plantilla:'coquimbo-v3',versiones:['remuneraciones','transparencia']}));
const rol = process.env.PDF_ROLE || 'legacy';
const cola = rol === 'legacy' ? null : crearColaGoogle(servicio.generar);
if (rol === 'worker') {
  const verifier = new driveAPI.auth.OAuth2();
  app.post('/tareas/pdf', express.json({limit:'2kb'}), async (req,res) => {
    try {
      const token = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1];
      const ticket = await verifier.verifyIdToken({idToken:token, audience:process.env.PDF_WORKER_URL});
      const claims = ticket.getPayload();
      if (claims.email !== process.env.PDF_TASK_SERVICE_ACCOUNT || !claims.email_verified) throw new Error('Identidad inválida');
    } catch (_) { return res.status(401).json({error:'No autorizado'}); }
    try {
      await cola.ejecutar(req.body.id);
      res.json({exito:true});
    } catch(error) {
      console.error(JSON.stringify({evento:'cola_intento_fallido',status:error.status || 503}));
      res.status(error.status === 400 || error.status === 404 ? error.status : 503).json({error:'Tarea no completada'});
    }
  });
  // La imagen del worker no expone generación directa ni consulta de datos.
  app.use((req,res) => res.status(404).end());
}
app.use((req,res,next) => servicio.autorizado(req.get('x-api-key')) ? next() : res.status(401).json({exito:false,error:'No autorizado'}));
app.use(express.json({limit:'768kb'}));
if (rol === 'api') {
  const ruta = fn => async (req,res) => {
    try { res.json(await fn(req)); }
    catch(e) {
      const status = [400,404,409,410,429].includes(e.status) ? e.status : 503;
      console.error(JSON.stringify({evento:'cola_api_error',status}));
      res.status(status).json({error:status === 503 ? 'Cola temporalmente no disponible' : e.message});
    }
  };
  app.post('/cola', ruta(req => cola.enviar(req.body.operationId, req.body.payload)));
  app.post('/cola/estados', ruta(req => cola.estados(req.body.ids, req.body.reparar === true)));
  app.post('/cola/resultado', ruta(req => cola.resultado(req.body.id)));
  app.use((req,res) => res.status(404).end());
}
app.post('/generarPDF', async(req,res) => {
  const inicio = Date.now();
  try {
    const id = req.get('Idempotency-Key') || req.body.operationId;
    const resultado = await servicio.generar(req.body,id);
    console.info(JSON.stringify({evento:'pdf_exportado',duracionMs:Date.now()-inicio}));
    res.json(resultado);
  } catch(error) {
    const status = [400,409,429].includes(error.status) ? error.status : 502;
    if (status === 429) res.set('Retry-After','10');
    console.error(JSON.stringify({evento:'pdf_error',status,duracionMs:Date.now()-inicio}));
    res.status(status).json({exito:false,error:status === 502 ? 'No se pudo confirmar la exportación de los PDF' : error.message});
  }
});
app.use((error,req,res,next) => res.status(error.status === 413 ? 413 : 400).json({exito:false,error:'Solicitud inválida'}));
app.listen(process.env.PORT || 8080);
