const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function entorno(){
 const elementos=new Map(),eventos={},timers=new Set(),estados=[];let llamadas=0,fin,fallo,foco='',borradores=0;
 const el=id=>{if(!elementos.has(id))elementos.set(id,{innerHTML:'Generar PDF',disabled:false,textContent:'',classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},focus(){foco=id;}});return elementos.get(id);};
 const c=vm.createContext({tutorialActivo:false,currentStep:2,procesoBloqueado:false,
  window:{addEventListener:(name,fn)=>eventos[name]=fn},document:{getElementById:el,querySelector:()=>el('loader-card'),addEventListener:(name,fn)=>eventos[name]=fn,removeEventListener:name=>delete eventos[name]},
  sessionStorage:{setItem(){}},toggleLoader:()=>{},guardarBorradorInforme:()=>borradores++,recopilarDatos:()=>({rut:'12345678-5'}),
  solicitarBackend:()=>{llamadas++;return new Promise((ok,no)=>{fin=ok;fallo=no;});},configurarPaso3Individual:()=>{c.currentStep=3;},
  safeClassAdd(){},safeClassRemove(){},actualizarEstadoInforme:msg=>estados.push(msg),setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn),
  Swal:{fire:async options=>{estados.push(options.title);}},alert:msg=>estados.push(msg)});
 const source=fs.readFileSync('JS_ACTIONS.html','utf8');for(const s of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(s[1],c);
 return {c,el,eventos,timers,estados,terminar:(r)=>fin(r || {exito:true,urlRemu:'R',urlTransp:'T'}),rechazar:()=>fallo(new Error('RECUPERACION_CLOUD: pendiente')),get llamadas(){return llamadas;},get foco(){return foco;},get borradores(){return borradores;}};
}
test('la espera impide doble envío, guarda borrador y limpia reloj/foco al recibir las descargas',async()=>{
 const e=entorno(),primera=e.c.generarIndividual();await e.c.generarIndividual();
 assert.equal(e.llamadas,1);assert.equal(e.borradores,1);assert.equal(e.el('btnGenerar').disabled,true);
 let prevenido=false;e.eventos.beforeunload({preventDefault(){prevenido=true;}});assert(prevenido);
 e.terminar();await primera;assert.equal(e.timers.size,0);assert.equal(e.el('btnGenerar').disabled,false);assert.equal(e.foco,'btnDescargaRemu');
});
test('aceptación en cola guarda comprobante y libera pantalla sin anunciar PDF generados',async()=>{
 const e=entorno(),storage={};let seguimiento=0;
 e.c.sessionStorage.setItem=(k,v)=>storage[k]=v;
 e.c.iniciarSeguimientoPDF_=()=>seguimiento++;
 const p=e.c.generarIndividual();e.terminar({exito:true,encolado:true,ticket:'comprobante'});await p;
 assert.equal(JSON.parse(storage.app_pdf_pendiente).ticket,'comprobante');
 assert.equal(e.c.currentStep,2);assert.equal(seguimiento,1);
 assert.equal(e.el('btnGenerar').disabled,false);assert.equal(e.timers.size,0);
 let prevenido=false;e.eventos.beforeunload({preventDefault(){prevenido=true;}});assert(!prevenido);
 assert(!storage.app_session_links);
});
test('la respuesta ambigua conserva el formulario, explica revisión y no repite el HTTP',async()=>{
 const e=entorno(),pendiente=e.c.generarIndividual();e.rechazar();await pendiente;
 assert.equal(e.llamadas,1);assert.equal(e.timers.size,0);assert.equal(e.el('btnGenerar').disabled,false);
 assert(e.estados.includes('Hay que comprobar el resultado'));assert.equal(e.foco,'btnGenerar');assert.equal(e.eventos.keydown,undefined);
});
