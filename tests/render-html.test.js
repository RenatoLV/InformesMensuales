const test=require('node:test'),assert=require('node:assert/strict');
const {crearRenderHTML}=require('../cloud-run/optimizado/render-html');
function entorno(){
 const contextos=[],eventos=[];let lanzamientos=0;
 const chromium={launch:async()=>{lanzamientos++;return {
  on:(nombre,fn)=>eventos.push(fn),newContext:async options=>{
   const c={options,cerrado:false,html:'',onRoute:null,
    route:async(pattern,fn)=>{c.onRoute=fn;},close:async()=>{c.cerrado=true;},
    newPage:async()=>({setContent:async html=>{c.html=html;},waitForFunction:async()=>{},
     evaluate:async()=>c.error,pdf:async()=>Buffer.from('%PDF-1.7 prueba')})};
   contextos.push(c);return c;
  }};}};
 return {chromium,contextos,eventos,get lanzamientos(){return lanzamientos;}};
}
test('renderer reutiliza navegador, aísla documentos y sirve solo los cuatro recursos locales',async()=>{
 const e=entorno(),metricas=[],render=crearRenderHTML(e.chromium,{onMetric:m=>metricas.push(m)});
 await render({Nombre:'PRIVADO A'});await render({Nombre:'PERSONA B',transparencia:true});
 assert.equal(e.lanzamientos,1);assert.equal(e.contextos.length,2);
 assert(e.contextos.every(c=>c.cerrado&&c.options.offline&&c.options.serviceWorkers==='block'));
 assert(!e.contextos[1].html.includes('PRIVADO A'));assert(!e.contextos[0].html.includes('data:font/ttf;base64'));
 assert(e.contextos[0].html.length<20000);assert.equal(metricas.length,2);
 assert(!JSON.stringify(metricas).includes('PRIVADO A'));
 let served,aborted=0;
 await e.contextos[0].onRoute({request:()=>({url:()=> 'https://pdf-assets.invalid/logos.png'}),fulfill:async r=>served=r});
 assert.equal(served.contentType,'image/png');assert(served.body.length>0);
 for(const url of ['https://externo.test/','https://pdf-assets.invalid/../secret','https://pdf-assets.invalid/logos.png?rut=123']){
  await e.contextos[0].onRoute({request:()=>({url:()=>url}),abort:async()=>aborted++});
 }
 assert.equal(aborted,3);
 e.eventos[0]();await render({Nombre:'C'});assert.equal(e.lanzamientos,2);
});
test('un campo inválido no inicia Chromium y un error de métricas no pierde el PDF',async()=>{
 const e=entorno(),render=crearRenderHTML(e.chromium,{onMetric:()=>{throw new Error('log');}});
 await assert.rejects(render({Nombre:42}),{status:400});assert.equal(e.lanzamientos,0);
 assert((await render({Nombre:'A'})).toString().startsWith('%PDF-'));
 assert(e.contextos[0].cerrado);
});
test('modo incrustado conserva exportaciones autónomas sin depender del servidor de recursos',async()=>{
 const e=entorno();await crearRenderHTML(e.chromium,{recursosLocales:false})({Nombre:'A'});
 assert(e.contextos[0].html.includes('data:font/ttf;base64'));assert.equal(e.contextos[0].onRoute,null);
});
