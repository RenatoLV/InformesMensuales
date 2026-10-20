// Lee metadata del servicio por stdin. Nunca imprime ni guarda claves de acceso.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {transparenciaSegura}=require('../cloud-run/optimizado/privacidad');
async function main(){
 const servicio=JSON.parse(fs.readFileSync(0,'utf8'));
 const key=servicio.spec.template.spec.containers[0].env.find(e=>e.name==='API_KEY')?.value;
 if (!key)throw new Error('La clave del servicio no está disponible para esta comprobación');
 const etiqueta=process.env.PDF_TEST_TAG || 'html-prueba';
 const tag=process.env.PDF_TEST_CANONICAL === 'true' ? null : servicio.status.traffic.find(t=>t.tag===etiqueta);
 if(process.env.PDF_TEST_TAG && !tag?.url)throw new Error('La revisión de prueba solicitada no tiene URL: '+etiqueta);
 const base=tag?.url || servicio.status.url;
 if(!/^https:\/\/[a-z0-9.-]+\.run\.app$/.test(base))throw new Error('Endpoint no válido');
 const estado=await fetch(base,{signal:AbortSignal.timeout(30000)}).then(r=>r.json());
 if(estado.motor!=='HTML' || estado.plantilla!=='coquimbo-v3')throw new Error('La revisión no corresponde al generador esperado');
 const denegado=await fetch(base+'/generarPDF',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 if(denegado.status!==401)throw new Error('El endpoint no está comprobando la clave');
 const datos={mes:'OCTUBRE',anio:'2026',Nombre:'FUNCIONARIO DE DEMOSTRACIÓN',Rut:'12.345.678-5',Direccion:'UNIDAD DE DEMOSTRACIÓN',Programa:'HONORARIOS',
 funcion:'Apoyo administrativo municipal.',fecha:'01/01/1990',periodoMes:'01/10/2026',periodoFinMes:'31/10/2026',
 informe_glosa:'Actividad de prueba de conexión con Cloud. Sin datos de funcionarios reales.',Dificultades_glosa:'Sin dificultades.',LICENCIA:'NO PRESENTA',ENFERMEDAD:'NO PRESENTA',VACACIONES:'NO PRESENTA',
 Jefatura:'JEFATURA DE DEMOSTRACIÓN',Cargo:'Jefatura de unidad',DirJefatura:'DIRECCIÓN DE CULTURA',FONO:'912345678',CORREO:'demo@example.test',tieneLicencia:false};
 async function generar(payload){const id='verificacion_'+crypto.randomUUID(),inicio=Date.now();const respuesta=await fetch(base+'/generarPDF',{
  method:'POST',headers:{'content-type':'application/json','x-api-key':key,'Idempotency-Key':id},body:JSON.stringify({...payload,operationId:id}),signal:AbortSignal.timeout(180000)});
  if(!respuesta.ok)throw new Error('Cloud no confirmó la prueba HTTP '+respuesta.status);
  const resultado=await respuesta.json();
  if(!resultado.exito || !['pdfRemuBase64','pdfTranspBase64'].every(k=>Buffer.from(resultado[k]||'','base64').subarray(0,5).toString()==='%PDF-'))throw new Error('Cloud no devolvió ambos PDF válidos');
  return {resultado,duracionMs:Date.now()-inicio};
 }
 const html=await generar({documentosHTML:{motor:'HTML',remuneraciones:datos,transparencia:transparenciaSegura(datos,datos)}});
 const salida=path.resolve(__dirname,'../output/pdf');fs.mkdirSync(salida,{recursive:true});
 fs.writeFileSync(path.join(salida,'cloud-verificacion-remuneraciones.pdf'),Buffer.from(html.resultado.pdfRemuBase64,'base64'));
 fs.writeFileSync(path.join(salida,'cloud-verificacion-transparencia.pdf'),Buffer.from(html.resultado.pdfTranspBase64,'base64'));
 console.log(JSON.stringify({prueba:'HTML',estado:'ok',duracionMs:html.duracionMs,plantilla:estado.plantilla,autenticacion:'401 sin clave',revision:tag?.revisionName || servicio.status.latestReadyRevisionName}));
 const plantilla='1oFZAitbjtPMGN-PO53OHHKYoN3hPe3qK-4PJdDlFVnU';
 const legacy=await generar({docIdRemu:plantilla,docIdTransp:plantilla});
 console.log(JSON.stringify({prueba:'compatibilidad Docs con plantilla vacía',estado:'ok',duracionMs:legacy.duracionMs}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
