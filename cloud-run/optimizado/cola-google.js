const {Readable} = require('node:stream');
const {crearCola} = require('./cola');

function crearColaGoogle(generar, env = process.env) {
  for (const key of ['GOOGLE_CLOUD_PROJECT','PDF_BUCKET','PDF_TASK_QUEUE','PDF_WORKER_URL','PDF_TASK_SERVICE_ACCOUNT']) {
    if (!env[key]) throw new Error(`${key} es obligatorio para la cola`);
  }
  // Carga selectiva y diferida: el servicio legacy no necesita estas APIs.
  const firestoreAPI = require('googleapis/build/src/apis/firestore');
  const storageAPI = require('googleapis/build/src/apis/storage');
  const tasksAPI = require('googleapis/build/src/apis/cloudtasks');
  const auth = new firestoreAPI.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
  const firestore = firestoreAPI.firestore({version:'v1', auth});
  const storage = storageAPI.storage({version:'v1', auth});
  const tasks = tasksAPI.cloudtasks({version:'v2', auth});
  const base = `projects/${env.GOOGLE_CLOUD_PROJECT}/databases/${env.PDF_DATABASE || '(default)'}/documents/pdf_jobs`;
  const opciones = {timeout:30000, retry:false};
  const codigo = e => Number(e.response?.status || e.code);
  const repo = {
    async leer(id) {
      try {
        const {data} = await firestore.projects.databases.documents.get({name:`${base}/${id}`}, opciones);
        return {version:data.updateTime, valor:JSON.parse(data.fields.json.stringValue)};
      } catch (e) { if (codigo(e) === 404) return null; throw e; }
    },
    async cas(id, version, valor) {
      try {
        await firestore.projects.databases.documents.patch({
          name:`${base}/${id}`,
          ...(version ? {'currentDocument.updateTime':version} : {'currentDocument.exists':false}),
          requestBody:{fields:{json:{stringValue:JSON.stringify(valor)}, expiresAt:{timestampValue:valor.expiresAt}}}
        }, opciones);
        return true;
      } catch (e) {
        if ([409,412].includes(codigo(e)) || e.response?.data?.error?.status === 'FAILED_PRECONDITION') return false;
        throw e;
      }
    }
  };
  async function leer(nombre) {
    try {
      const {data} = await storage.objects.get({bucket:env.PDF_BUCKET, object:nombre, alt:'media'},
        {...opciones, responseType:'text'});
      return typeof data === 'string' ? data : JSON.stringify(data);
    } catch(e) { if (codigo(e) === 404) return null; throw e; }
  }
  async function poner(nombre, texto, comparar) {
    try {
      await storage.objects.insert({bucket:env.PDF_BUCKET, name:nombre, ifGenerationMatch:'0',
        requestBody:{contentType:'application/json', cacheControl:'no-store'},
        media:{mimeType:'application/json', body:Readable.from([texto])}}, opciones);
    } catch(e) {
      if (codigo(e) !== 412) throw e;
      if (comparar && await leer(nombre) !== texto) throw Object.assign(new Error('Operación usada con otros datos'),{status:409});
    }
  }
  const objetos = {
    ponerSolicitud:(id, texto) => poner(`solicitudes/${id}.json`,texto,true),
    leerSolicitud:id => leer(`solicitudes/${id}.json`),
    ponerResultado:(id, texto) => poner(`resultados/${id}.json`,texto,false),
    leerResultado:async id => { const texto = await leer(`resultados/${id}.json`); return texto ? JSON.parse(texto) : null; }
  };
  const tareas = {async crear(id, ventana) {
    try {
      await tasks.projects.locations.queues.tasks.create({parent:env.PDF_TASK_QUEUE, requestBody:{task:{
        name:`${env.PDF_TASK_QUEUE}/tasks/pdf-${id}-${ventana}`,
        dispatchDeadline:'240s',
        httpRequest:{httpMethod:'POST', url:env.PDF_WORKER_URL + '/tareas/pdf',
          headers:{'Content-Type':'application/json'},
          body:Buffer.from(JSON.stringify({id})).toString('base64'),
          oidcToken:{serviceAccountEmail:env.PDF_TASK_SERVICE_ACCOUNT, audience:env.PDF_WORKER_URL}}
      }}}, opciones);
    } catch(e) { if (codigo(e) !== 409) throw e; }
  }};
  return crearCola({repo,objetos,tareas,generar});
}
module.exports = {crearColaGoogle};
