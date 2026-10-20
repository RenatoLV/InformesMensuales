const test = require('node:test');
const assert = require('node:assert/strict');
const {crearCola} = require('../cloud-run/optimizado/cola');
const payload = {documentosHTML:{motor:'HTML',remuneraciones:{nombre:'Ejemplo'},transparencia:{nombre:'Ejemplo'}}};
const copia = x => x == null ? x : JSON.parse(JSON.stringify(x));
function entorno() {
  const docs = new Map(), solicitudes = new Map(), resultados = new Map(), tareas = new Set();
  let reloj = 1000000, renders = 0;
  const repo = {
    async leer(id) { return copia(docs.get(id)); },
    async cas(id, version, valor) {
      const previo = docs.get(id);
      if ((previo?.version || null) !== (version || null)) return false;
      docs.set(id,{version:(previo?.version || 0)+1,valor:copia(valor)}); return true;
    }
  };
  const objetos = {
    async ponerSolicitud(id,texto) {
      if (solicitudes.has(id) && solicitudes.get(id) !== texto) throw Object.assign(new Error('Conflicto'),{status:409});
      solicitudes.set(id,texto);
    },
    async leerSolicitud(id) { return solicitudes.get(id); },
    async ponerResultado(id,texto) { if (!resultados.has(id)) resultados.set(id,JSON.parse(texto)); },
    async leerResultado(id) { return copia(resultados.get(id)); }
  };
  const deps = {repo,objetos,tareas:{async crear(id,ventana) { tareas.add(id + '-' + ventana); }},
    generar:async () => { renders++; return {exito:true,pdfRemuBase64:'remu',pdfTranspBase64:'transp'}; },
    now:()=>reloj};
  return {deps,docs,resultados,tareas,objetos,cola:crearCola(deps),avanzar:ms=>reloj+=ms,get renders(){return renders;}};
}
test('cola persiste y deduplica envíos, rechaza otros datos y recupera tras reiniciar contenedor',async()=>{
  const e=entorno(), id='operacion-001';
  await Promise.all(Array.from({length:10},()=>e.cola.enviar(id,payload)));
  assert.equal(e.docs.size,1);assert.equal(e.tareas.size,1);
  await assert.rejects(e.cola.enviar(id,{...payload,otro:true}),{status:409});
  await crearCola(e.deps).ejecutar(id);
  await crearCola(e.deps).ejecutar(id);
  assert.equal(e.renders,1);
  assert.equal((await e.cola.resultado(id)).pdfTranspBase64,'transp');
});
test('outbox repara un fallo de Tasks después de persistir',async()=>{
  const e=entorno();let fail=true;
  e.deps.tareas.crear=async()=>{if(fail)throw new Error('red');};
  const cola=crearCola(e.deps);
  await assert.rejects(cola.enviar('operacion-002',payload),/red/);
  assert.equal(e.docs.get('operacion-002').valor.estado,'EN_COLA');
  fail=false;
  await cola.estados(['operacion-002'],true);
  await cola.ejecutar('operacion-002');
  assert.equal(e.renders,1);
});
test('una entrega duplicada concurrente no ejecuta dos renderizadores',async()=>{
  const e=entorno();let liberar;
  e.deps.generar=()=>new Promise(ok=>liberar=()=>ok({exito:true}));
  const cola=crearCola(e.deps);
  await cola.enviar('operacion-003',payload);
  const primero=cola.ejecutar('operacion-003');
  while(!liberar)await new Promise(ok=>setImmediate(ok));
  await assert.rejects(cola.ejecutar('operacion-003'),{status:429});
  liberar();await primero;
  assert.equal(e.docs.get('operacion-003').valor.intentos,1);
});
test('caída después de guardar bytes se recupera sin renderizar otra vez',async()=>{
  const e=entorno();
  await e.cola.enviar('operacion-004',payload);
  e.resultados.set('operacion-004',{exito:true,pdfRemuBase64:'persistido'});
  await crearCola(e.deps).ejecutar('operacion-004');
  assert.equal(e.renders,0);assert.equal(e.docs.get('operacion-004').valor.estado,'LISTO');
});
test('lease vencido permite recuperar y un worker antiguo no puede sobrescribir estado',async()=>{
  const e=entorno();let liberar, n=0;
  e.deps.generar=async()=>++n===1?new Promise(ok=>liberar=ok):{exito:true};
  const cola=crearCola(e.deps);
  await cola.enviar('operacion-005',payload);
  const antiguo=cola.ejecutar('operacion-005');
  while(!liberar)await new Promise(ok=>setImmediate(ok));
  e.avanzar(300001);
  await cola.ejecutar('operacion-005');
  const version=e.docs.get('operacion-005').version;
  liberar({exito:true});await antiguo;
  assert.equal(e.docs.get('operacion-005').version,version);
  assert.equal(e.docs.get('operacion-005').valor.estado,'LISTO');
});
test('limita intentos y plazo; no deja bucles de facturación indefinidos',async()=>{
  const e=entorno();e.deps.generar=async()=>{throw new Error('fallo');};
  const cola=crearCola(e.deps);
  await cola.enviar('operacion-006',payload);
  for(let i=0;i<8;i++)await assert.rejects(cola.ejecutar('operacion-006'));
  await cola.ejecutar('operacion-006');
  assert.equal(e.docs.get('operacion-006').valor.intentos,8);
  assert.equal(e.docs.get('operacion-006').valor.estado,'ERROR');
  await cola.enviar('operacion-007',payload);e.avanzar(86400001);
  assert.equal((await cola.estados(['operacion-007'],true))[0].estado,'ERROR');
});
test('100 solicitudes con despachador de cinco trabajadores terminan una sola vez',async()=>{
  const e=entorno(), ids=Array.from({length:100},(_,i)=>`operacion-carga-${i}`);
  await Promise.all(ids.map(id=>e.cola.enviar(id,payload)));
  for(let i=0;i<ids.length;i+=5)await Promise.all(ids.slice(i,i+5).map(id=>e.cola.ejecutar(id)));
  assert.equal(e.renders,100);assert.equal([...e.docs.values()].filter(d=>d.valor.estado==='LISTO').length,100);
  await Promise.all(ids.map(id=>e.cola.ejecutar(id)));assert.equal(e.renders,100);
});
