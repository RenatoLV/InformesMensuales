const test = require('node:test');
const assert = require('node:assert/strict');
const {crearServicio} = require('../cloud-run/optimizado/app');
const datos = {docIdRemu:'doc_remu_123456',docIdTransp:'doc_transp_123456'};

test('Cloud HTML renderiza sin exportar Docs, deduplica y rechaza cambios en una operación',async()=>{
  let renders=0;
  const servicio=crearServicio({apiKey:'prueba',drive:{files:{export:()=>{throw new Error('No Docs');}}},
    renderHTML:async()=>{renders++;return Buffer.from('%PDF-prueba');}});
  const html={documentosHTML:{motor:'HTML',remuneraciones:{Nombre:'Demo'},transparencia:{Nombre:'Demo',Rut:'DATOS RESERVADOS'}}};
  await Promise.all([servicio.generar(html,'operacion_html'),servicio.generar(html,'operacion_html')]);
  assert.equal(renders,2);
  await assert.rejects(servicio.generar({documentosHTML:{...html.documentosHTML,remuneraciones:{Nombre:'Otra'}}},'operacion_html'),e=>e.status===409);
});
test('Cloud fuerza la privacidad pública y genera las versiones HTML sin superponer renderizados',async()=>{
 let activos=0,maximo=0;const recibidos=[];
 const servicio=crearServicio({apiKey:'prueba',renderHTML:async d=>{activos++;maximo=Math.max(maximo,activos);recibidos.push(d);
   await new Promise(ok=>setTimeout(ok,1));activos--;return Buffer.from('%PDF-prueba');}});
 const privado={Nombre:'Demo',Rut:'12.345.678-5',fecha:'01/01/1990',FONO:'912345678',CORREO:'demo@example.test',LICENCIA:'Licencia médica',ENFERMEDAD:'NO PRESENTA'};
 const publico={...privado,transparencia:false,informe_glosa:'Contacto demo@example.test RUT 12.345.678-5',lineasActividades:[{segmentos:[{texto:'Contacto demo@'},{texto:'example.test RUT 12.345.678-5'}]}]};
 await servicio.generar({documentosHTML:{motor:'HTML',remuneraciones:privado,transparencia:publico}},'privacidad_html_01');
 assert.equal(maximo,1);assert.equal(recibidos[1].transparencia,true);
 const texto=JSON.stringify(recibidos[1]);for(const valor of [privado.Rut,privado.fecha,privado.FONO,privado.CORREO,privado.LICENCIA])assert(!texto.includes(valor));
 assert.equal(recibidos[1].FONO,'');assert.equal(recibidos[1].CORREO,'');
});
test('Cloud exige la clave exacta y reutiliza exportaciones de una misma operación', async() => {
  let llamadas=0;
  const servicio=crearServicio({apiKey:'clave-prueba',drive:{files:{export:async()=>{llamadas++;return {data:Buffer.from('%PDF-prueba')};}}}});
  assert.equal(servicio.autorizado('clave-prueba'),true);
  assert.equal(servicio.autorizado('CLAVE-PRUEBA'),false);
  assert.equal(servicio.autorizado('prefijo-clave-prueba'),false);
  assert.throws(()=>crearServicio({apiKey:''}),/obligatoria/);
  const [uno,dos]=await Promise.all([servicio.generar(datos,'operacion_123'),servicio.generar(datos,'operacion_123')]);
  assert.deepEqual(uno,dos); assert.equal(llamadas,2);
  await servicio.generar(datos,'operacion_123'); assert.equal(llamadas,2);
  await assert.rejects(servicio.generar({...datos,docIdRemu:'otro_doc_123456'},'operacion_123'),error=>error.status===409);
});
test('Cloud limita concurrencia y libera el cupo solo al terminar ambas exportaciones', async()=>{
  const pendientes=[];
  const servicio=crearServicio({apiKey:'prueba',maxActivas:1,drive:{files:{export:()=>new Promise((resolve,reject)=>pendientes.push({resolve,reject}))}}});
  const uno=servicio.generar(datos,'operacion_001');
  await assert.rejects(servicio.generar(datos,'operacion_002'),error=>error.status===429);
  pendientes[0].reject(new Error('fallo')); pendientes[1].resolve({data:Buffer.from('%PDF')});
  await assert.rejects(uno,/fallo/);
  const dos=servicio.generar(datos,'operacion_002');
  pendientes[2].resolve({data:Buffer.from('%PDF')}); pendientes[3].resolve({data:Buffer.from('%PDF')});
  assert.equal((await dos).exito,true);
});
