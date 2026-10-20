// Prueba local de adaptador Apps Script -> servicio Cloud -> Chromium, con datos ficticios.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {crearRenderHTML}=require('../cloud-run/optimizado/render-html');
const {crearServicio}=require('../cloud-run/optimizado/app');
const base=path.resolve(__dirname,'..');
async function main(){
 const context=vm.createContext({});
 for(const file of ['Utils.js','FormatoActividades.js','PlantillaCloud.js']) vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context);
 const actividad='Atención municipal\nSe revisaron antecedentes del periodo.\nContacto: demo@example.test\n';
 const datos={nombre:'FUNCIONARIO DE DEMOSTRACIÓN',rut:'12345678-5',direccion:'DIRECCIÓN DE RECURSOS HUMANOS',programa:'HONORARIOS',
  nacimiento:'01/01/1990',funcion:'Apoyo administrativo y atención municipal.',fechaInicioMes:'01/10/2026',fechaFinMes:'31/10/2026',
  actividades:actividad,dificultades:'Sin dificultades.',datoLicencia:'NO PRESENTA',datoEnfermedad:'NO PRESENTA',datoVacaciones:'NO PRESENTA',
  jefaturaNombre:'JEFATURA DE DEMOSTRACIÓN',jefaturaCargo:'Jefatura de unidad',jefaturaDireccion:'UNIDAD SELECCIONADA DE LA JEFATURA',fono:'912345678',correo:'demo@example.test',
  actividadesFormato:JSON.stringify({ops:[{insert:'Atención municipal',attributes:{bold:true,color:'#173d50'}},{insert:'\n',attributes:{header:2}},
   {insert:'Se revisaron antecedentes del periodo.',attributes:{italic:true}},{insert:'\n',attributes:{list:'bullet'}},
   {insert:'Contacto: demo@example.test\n'}]})};
 const periodo={mes:'OCTUBRE',anio:2026};
 const documentosHTML={motor:'HTML',remuneraciones:context.datosPlantillaCloud_(datos,periodo,true),transparencia:context.datosPlantillaCloud_(datos,periodo,false)};
 assert(!JSON.stringify(documentosHTML.transparencia).includes('demo@example.test'));
 const playwright=require(process.env.CODEX_PLAYWRIGHT_PATH || 'playwright');let browser;
 const chromium={launch:async options=>{browser=await playwright.chromium.launch({...options,executablePath:process.env.PDF_CHROMIUM_PATH || undefined});return browser;}};
 try{
  const servicio=crearServicio({apiKey:'prueba-local',renderHTML:crearRenderHTML(chromium)});
  const resultado=await servicio.generar({documentosHTML},'integracion_html_001');
  fs.mkdirSync(path.join(base,'output/pdf'),{recursive:true});
  fs.writeFileSync(path.join(base,'output/pdf/informe-integrado-remuneraciones.pdf'),Buffer.from(resultado.pdfRemuBase64,'base64'));
  fs.writeFileSync(path.join(base,'output/pdf/informe-integrado-transparencia.pdf'),Buffer.from(resultado.pdfTranspBase64,'base64'));
  console.log('Integración local: dos PDF con formato, sin exportación de Google Docs.');
 }finally{if(browser)await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
