const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
async function pantalla(guardado) {
 const ids=['mensaje','mes-recepcion','anio-recepcion','revisado','total','listos','pendientes','registrados','pausar','exportar','registrar','buscar-recepcion','filtro','listado','pagina-anterior','pagina-siguiente','pagina-resumen','personas-recepcion','cuenta','nuevo','avance','progreso','consultar','local-remu','local-transp','leer-remu','leer-transp','drive-remu','drive-transp'];
 const element=(tag='div')=>({tag,value:'',checked:false,disabled:false,children:[],textContent:'',classList:{toggle(){}},setAttribute(){},append(...x){this.children.push(...x);},replaceChildren(...x){this.children=x;},remove(){},click(){}});
 const els=Object.fromEntries(ids.map(id=>[id,element()]));els.filtro.value='todos';els['anio-recepcion'].value='2026';
 const storage=new Map(guardado?[['recepcion_masiva_v1',guardado]]:[]),calls=[],events={};
 const personas=[{rut:'12345678-5',nombre:'MARIA PEREZ'},{rut:'09222054-0',nombre:'JUAN GONZALEZ'}];
 let failRut='';
 const run=new Proxy({},{get(_,key){let ok,no;const chain=new Proxy({},{get(_,fn){
   if(fn==='withSuccessHandler')return f=>{ok=f;return chain;};if(fn==='withFailureHandler')return f=>{no=f;return chain;};
   return (...args)=>queueMicrotask(()=>{
    calls.push({fn,args});
    if(fn==='obtenerCatalogoRecepcionMasiva')return ok({email:'admin@test.local',nomina:'DEMO',personas,anio:2026,mes:10});
    if(fn==='consultarEstadoRecepcionMasiva')return ok({});
    if(fn==='registrarParRecepcionMasiva'){
      if(args[0].rut===failRut)return no(new Error('Respuesta incierta'));
      return ok({exito:true,rut:args[0].rut,remu:'https://drive.google.com/file/d/remu/view',transp:'https://drive.google.com/file/d/transp/view'});
    }no(new Error('RPC inesperado'));
   });
 }});return chain[key];}});
 const c=vm.createContext({crypto,console,confirm:()=>true,setTimeout,Blob,URL,
 document:{getElementById:id=>els[id],createElement:element,createDocumentFragment:()=>element('fragment'),querySelectorAll:()=>Object.values(els),body:element()},
 sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
 window:{addEventListener:(k,fn)=>events[k]=fn},google:{script:{run}},
 FileReader:class{readAsDataURL(f){this.result='data:application/pdf;base64,'+Buffer.from(f.content).toString('base64');queueMicrotask(()=>this.onload());}}
 });
 for(const f of ['JS_RECEPCION_MODELO.html','JS_RECEPCION.html'])vm.runInContext(fs.readFileSync(f,'utf8').replace(/<\/?script>/g,''),c);
 await new Promise(setImmediate);
 return {els,calls,storage,events,set failRut(v){failRut=v;},
 add(tipo,files){els['local-'+tipo].files=files;els['local-'+tipo].onchange({target:els['local-'+tipo]});},
 async registrar(){els.revisado.checked=true;els.revisado.onchange();await els.registrar.onclick();}};
}
const file=(name,content)=>({name,size:100,lastModified:123,content,slice:()=>({text:async()=>content.slice(0,5)})});
test('la interfaz procesa archivos locales de a un par, pausa ante error y reanuda sin reenviar el confirmado',async()=>{
 const p=await pantalla();
 p.add('remu',[file('MARIA PEREZ.pdf','%PDF-remu-maria'),file('JUAN GONZALEZ.pdf','%PDF-remu-juan')]);
 p.add('transp',[file('MARIA PEREZ.pdf','%PDF-transp-maria'),file('JUAN GONZALEZ.pdf','%PDF-transp-juan')]);
 assert.equal(p.els.listos.textContent,2);
 p.failRut='12345678-5';await p.registrar();
 assert.equal(p.els.registrados.textContent,1);assert.match(p.els.mensaje.textContent,/pausada por un error/);
 let writes=p.calls.filter(x=>x.fn==='registrarParRecepcionMasiva');
 assert.equal(writes.length,2);assert(writes.every(x=>x.args[0].remu.base64 && x.args[0].transp.base64));
 p.failRut='';await p.registrar();writes=p.calls.filter(x=>x.fn==='registrarParRecepcionMasiva');
 assert.equal(writes.length,3);assert.equal(writes[2].args[0].rut,'12345678-5');assert.equal(p.els.registrados.textContent,2);
 const saved=p.storage.get('recepcion_masiva_v1');assert(!saved.includes('base64'));assert(!saved.includes('%PDF'));
 const restaurada=await pantalla(saved);assert.equal(restaurada.els.registrados.textContent,2);assert.equal(restaurada.els.pendientes.textContent,0);
});
test('PDF local falso no llega al servidor y una pareja incompleta no puede registrarse',async()=>{
 const p=await pantalla();
 p.add('remu',[file('MARIA PEREZ.pdf','texto falso')]);assert.equal(p.els.listos.textContent,0);
 p.add('transp',[file('MARIA PEREZ.pdf','%PDF-publico')]);await p.registrar();
 assert.equal(p.calls.filter(x=>x.fn==='registrarParRecepcionMasiva').length,0);
 assert.match(p.els.mensaje.textContent,/pausada por un error/);
});
test('el borrador de otra cuenta no se muestra al administrador actual',async()=>{
 const p=await pantalla(JSON.stringify({owner:'otra@test.local',archivos:[{name:'persona ajena.pdf'}],periodo:{mes:'OCTUBRE',anio:2026}}));
 assert.equal(p.els.total.textContent,0);
});
