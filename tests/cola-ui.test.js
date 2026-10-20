const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function entorno(){
 const storage={},elements=new Map(),timers=[];let llamadas=0,descargas=0;
 const c=vm.createContext({console,Math,Set,tutorialActivo:false,batchList:[],procesoBloqueado:false,
  sessionStorage:{getItem:k=>storage[k],setItem:(k,v)=>storage[k]=v,removeItem:k=>delete storage[k]},
  document:{hidden:false,getElementById:id=>elements.get(id),createElement:()=>({setAttribute(){}}),body:{appendChild:p=>elements.set(p.id,p)}},
  window:{addEventListener(){}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},
  recopilarDatos:()=>({rut:'12.345.678-5',mesSeleccionado:'OCTUBRE',anio:2026}),
  solicitarBackend:async(fn,tickets)=>{llamadas++;assert.equal(fn,'consultarGeneracionesPDF');return tickets.map(ticket=>({ticket,resultado:c.respuesta}));},
  configurarPaso3Individual:()=>descargas++,actualizarEstadoInforme(){},guardarEstadoLote(){},configurarPaso3Lote(){},
  respuesta:{exito:true,encolado:true}});
 vm.runInContext(fs.readFileSync('JS_COLA_PDF.html','utf8').replace(/<\/?script>/g,''),c);
 storage.app_pdf_pendiente=JSON.stringify({ticket:'ticket-1',rut:'12345678-5',mes:'OCTUBRE',anio:2026});
 return {c,storage,timers,elements,get llamadas(){return llamadas;},get descargas(){return descargas;}};
}
test('seguimiento consulta estado sin reenviar generación y se detiene al completar',async()=>{
 const e=entorno();await e.c.revisarColaPDF_();
 assert.equal(e.llamadas,1);assert(e.timers.at(-1).ms>=60000);assert.equal(e.descargas,0);
 e.c.respuesta={exito:true,urlRemu:'R',urlTransp:'T'};await e.c.revisarColaPDF_();
 assert.equal(e.descargas,1);assert(!e.storage.app_pdf_pendiente);
 assert.equal(JSON.parse(e.storage.app_session_links).transp,'T');
});
test('pestaña oculta no consulta y resultado de otro funcionario no altera formulario actual',async()=>{
 const e=entorno();e.c.document.hidden=true;await e.c.revisarColaPDF_();assert.equal(e.llamadas,0);
 e.c.document.hidden=false;e.c.recopilarDatos=()=>({rut:'87654321-K',mesSeleccionado:'OCTUBRE',anio:2026});
 e.c.respuesta={exito:true,urlRemu:'R',urlTransp:'T'};await e.c.revisarColaPDF_();
 assert.equal(e.descargas,0);assert(!e.storage.app_session_locked);
});
test('lote agrupa las consultas y solo habilita descarga al recibir ambos resultados confirmados',async()=>{
 const e=entorno();delete e.storage.app_pdf_pendiente;
 e.c.batchList=Array.from({length:100},(_,i)=>({rut:String(i),ticketPDF:'ticket-'+i,status:'EN COLA'}));
 await e.c.revisarColaPDF_();assert.equal(e.llamadas,2);
 assert(e.c.batchList.every(b=>b.status==='EN COLA'));
 e.c.respuesta={exito:true,urlRemu:'R',urlTransp:'T'};await e.c.revisarColaPDF_();
 assert(e.c.batchList.every(b=>b.status==='GENERADO'&&b.links.transp==='T'));
});
