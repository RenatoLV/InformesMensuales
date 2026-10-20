// Carga acotada: solo generación de PDF con datos ficticios. No escribe en Sheets/Drive.
// Recibe metadata de Cloud por stdin y conserva la clave exclusivamente en memoria.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {transparenciaSegura}=require('../cloud-run/optimizado/privacidad');
async function main(){
 const servicio=JSON.parse(fs.readFileSync(0,'utf8'));
 const key=servicio.spec.template.spec.containers[0].env.find(e=>e.name==='API_KEY')?.value;
 const url=servicio.status.url;
 if(!key || !/^https:\/\/[a-z0-9.-]+\.run\.app$/.test(url))throw new Error('No se pudo preparar la comprobación autenticada');
 const base={mes:'OCTUBRE',anio:'2026',Nombre:'FUNCIONARIO FICTICIO DE CARGA',Rut:'12.345.678-5',Direccion:'UNIDAD FICTICIA',Programa:'DEMOSTRACIÓN',funcion:'Apoyo administrativo municipal.',
  fecha:'01/01/1990',periodoMes:'01/10/2026',periodoFinMes:'31/10/2026',Dificultades_glosa:'Sin dificultades.',LICENCIA:'NO PRESENTA',ENFERMEDAD:'NO PRESENTA',VACACIONES:'NO PRESENTA',
  Jefatura:'JEFATURA FICTICIA',Cargo:'Jefatura',DirJefatura:'UNIDAD FICTICIA',FONO:'912345678',CORREO:'demo@example.test',tieneLicencia:false};
 const tamaños=[8,35,100];
 const resultados=[];
 async function solicitar(i){
  const lineas=tamaños[i%tamaños.length];
  const datos={...base,informe_glosa:Array.from({length:lineas},(_,n)=>'Actividad '+(n+1)+': Se revisaron antecedentes administrativos y se actualizaron los registros de seguimiento del periodo.').join('\n')};
  const id='carga_ficticia_'+crypto.randomUUID(),inicio=performance.now();
  try{
   const respuesta=await fetch(url+'/generarPDF',{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'Idempotency-Key':id},
    body:JSON.stringify({operationId:id,documentosHTML:{motor:'HTML',remuneraciones:datos,transparencia:transparenciaSegura(datos,datos)}}),signal:AbortSignal.timeout(180000)});
   const datosRespuesta=await respuesta.json();
   const valido=respuesta.ok && datosRespuesta.exito && ['pdfRemuBase64','pdfTranspBase64'].every(k=>Buffer.from(datosRespuesta[k]||'','base64').subarray(0,5).toString()==='%PDF-');
   return {ok:!!valido,http:respuesta.status,lineas,ms:Math.round(performance.now()-inicio)};
  }catch(error){return {ok:false,http:null,error:error.name,lineas,ms:Math.round(performance.now()-inicio)};}
 }
 for(const cantidad of [1,3,6,9]){
  const inicio=performance.now();
  const peticiones=await Promise.all(Array.from({length:cantidad},(_,i)=>solicitar(i)));
  const tiempos=peticiones.filter(r=>r.ok).map(r=>r.ms).sort((a,b)=>a-b);
  const resultado={simultaneas:cantidad,correctas:tiempos.length,fallos:peticiones.filter(r=>!r.ok).length,
   minimoMs:tiempos[0]??null,maximoMs:tiempos.at(-1)??null,medianaMs:tiempos.length?tiempos[Math.floor(tiempos.length/2)]:null,
   duracionGrupoMs:Math.round(performance.now()-inicio),peticiones};
  resultados.push(resultado);console.log(JSON.stringify(resultado));
  if(resultado.fallos)break; // No aumentar carga si aparece un problema.
 }
 const informe={fecha:new Date().toISOString(),revision:servicio.status.latestReadyRevisionName,alcance:'Solo Cloud, dos PDF por petición, actividades 8/35/100 líneas. Sin Apps Script, Sheets ni guardado Drive. Sin reintentos.',resultados};
 const salida=path.resolve(__dirname,'../output/prueba-concurrencia-cloud.json');fs.mkdirSync(path.dirname(salida),{recursive:true});fs.writeFileSync(salida,JSON.stringify(informe,null,2));
 if(resultados.some(r=>r.fallos))process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
