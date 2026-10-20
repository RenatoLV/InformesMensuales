// Benchmark local con datos ficticios; no llama a Google ni usa el perfil del usuario.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('../cloud-run/optimizado/node_modules/playwright');
const {PNG}=require('../cloud-run/optimizado/node_modules/playwright-core/lib/utilsBundle');
const {crearRenderHTML}=require('../cloud-run/optimizado/render-html');
const {crearHTML}=require('../cloud-run/plantilla-html/plantilla');
const {transparenciaSegura}=require('../cloud-run/optimizado/privacidad');
const carpeta=path.resolve(__dirname,'../output/optimizacion-cloud');
fs.mkdirSync(carpeta,{recursive:true});
const base={mes:'OCTUBRE',anio:'2026',Nombre:'PERSONA DE PRUEBA',Rut:'12.345.678-5',fecha:'01/01/1990',
 Direccion:'DIRECCIÓN DE PRUEBA',Programa:'HONORARIOS',funcion:'Apoyo administrativo y atención de público.',
 periodoMes:'01/10/2026',periodoFinMes:'31/10/2026',Jefatura:'JEFATURA DE PRUEBA',Cargo:'DIRECCIÓN',
 DirJefatura:'UNIDAD DE PRUEBA',FONO:'912345678',CORREO:'demo@example.test',LICENCIA:'NO PRESENTA',
 ENFERMEDAD:'NO PRESENTA',VACACIONES:'NO PRESENTA',Dificultades_glosa:'Sin dificultades.'};
const modos=['incrustado','recursos'],browsers=[],metricas=[],capturas={};let etiqueta;
async function main(){
 const renders={};
 for(const modo of modos){
  const motor={launch:async options=>{
   const browser=await chromium.launch({...options,executablePath:process.env.PDF_CHROMIUM_PATH || undefined});browsers.push(browser);
   const newContext=browser.newContext.bind(browser);
   browser.newContext=async options=>{
    const context=await newContext(options),cerrar=context.close.bind(context);
    context.close=async()=>{
     context.close=cerrar;
     try{if(etiqueta.qa){const page=context.pages()[0];
      const png=await page.screenshot({fullPage:true});
      const clave=modo+'-'+etiqueta.caso+'-'+etiqueta.version;
      fs.writeFileSync(path.join(carpeta,clave+'.png'),png);
      capturas[clave]={sha256:crypto.createHash('sha256').update(png).digest('hex'),
       paginas:await page.locator('.page').count(),texto:await page.locator('body').innerText()};
     }}finally{await cerrar();}
    };return context;
   };return browser;
  }};
  renders[modo]=crearRenderHTML(motor,{recursosLocales:modo==='recursos',onMetric:m=>metricas.push({modo,...etiqueta,...m})});
 }
 for(let vuelta=0;vuelta<3;vuelta++)for(const [caso,lineas] of [['corto',3],['medio',35],['largo',100]]){
  const privado={...base,informe_glosa:Array.from({length:lineas},(_,i)=>'Actividad '+(i+1)+': Atención de público y revisión de antecedentes administrativos del periodo.').join('\n')};
  const publico=transparenciaSegura(privado,{...privado});
  for(const [version,datos] of [['remu',privado],['transp',publico]])for(const modo of vuelta%2 ? [...modos].reverse():modos){
   etiqueta={caso,version,vuelta,qa:vuelta===0};
   const pdf=await renders[modo](datos);
   if(pdf.subarray(0,5).toString()!=='%PDF-')throw new Error('PDF inválido');
   if(vuelta===0)fs.writeFileSync(path.join(carpeta,modo+'-'+caso+'-'+version+'.pdf'),pdf);
  }
 }
 const comparaciones=[];
 for(const caso of ['corto','medio','largo'])for(const version of ['remu','transp']){
  const a=capturas['incrustado-'+caso+'-'+version],b=capturas['recursos-'+caso+'-'+version];
  const pa=PNG.sync.read(fs.readFileSync(path.join(carpeta,'incrustado-'+caso+'-'+version+'.png')));
  const pb=PNG.sync.read(fs.readFileSync(path.join(carpeta,'recursos-'+caso+'-'+version+'.png')));
  let canalesDistintos=0,maxDelta=0;
  for(let j=0;j<pa.data.length;j++){const delta=Math.abs(pa.data[j]-pb.data[j]);if(delta)canalesDistintos++;maxDelta=Math.max(maxDelta,delta);}
  const equivalente=pa.width===pb.width&&pa.height===pb.height&&maxDelta<=1&&canalesDistintos/pa.data.length<0.0001;
  comparaciones.push({caso,version,paginas:b.paginas,imagenIdentica:a.sha256===b.sha256,imagenEquivalente:equivalente,
   canalesDistintos,maxDelta,textoIdentico:a.texto===b.texto});
  if(!equivalente||a.texto!==b.texto||a.paginas!==b.paginas)throw new Error('Cambió el resultado visual: '+caso+' '+version);
  if(version==='transp'&&[base.Rut,base.fecha,base.FONO,base.CORREO].some(v=>b.texto.includes(v)))throw new Error('Dato privado visible');
 }
 const resumen=modos.map(modo=>{
  const filas=metricas.filter(m=>m.modo===modo),calientes=filas.slice(1).map(m=>m.totalMs).sort((a,b)=>a-b);
  return {modo,primerPDFms:filas[0].totalMs,medianaCalienteMs:calientes[Math.floor(calientes.length/2)],
   htmlBytes:filas[0].htmlBytes,pdfBytes:filas[0].pdfBytes};
 });
 fs.writeFileSync(path.join(carpeta,'resultado.json'),JSON.stringify({fecha:new Date().toISOString(),node:process.version,resumen,comparaciones,metricas},null,2));
 console.log(JSON.stringify({resumen,comparaciones},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{for(const browser of browsers)await browser.close();});
