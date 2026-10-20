// Render de artefactos HTML a PDF; no interactúa con el navegador del usuario.
const fs=require('node:fs'); const path=require('node:path');
const {crearHTML,referencia}=require('../cloud-run/plantilla-html/plantilla');
const base=path.resolve(__dirname,'..');
async function main(){
 const playwright=require(process.env.CODEX_PLAYWRIGHT_PATH || 'playwright');
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.PDF_CHROMIUM_PATH || undefined});
 try {
  const casos={referencia,ejemplo:{...referencia,mes:'OCTUBRE',anio:'2026',Nombre:'FUNCIONARIO DE DEMOSTRACIÓN',Rut:'12.345.678-5',Direccion:'DIRECCIÓN DE RECURSOS HUMANOS',Programa:'HONORARIOS',funcion:'Apoyo administrativo y atención municipal.',fecha:'01/01/1990',periodoMes:'01/10/2026',periodoFinMes:'31/10/2026',informe_glosa:'Atención municipal\nSe revisaron antecedentes y se atendieron las consultas del periodo.\nSe actualizaron los registros de seguimiento.',Dificultades_glosa:'Sin dificultades.',LICENCIA:'No presenta',ENFERMEDAD:'No presenta',VACACIONES:'No presenta',Jefatura:'JEFATURA DE DEMOSTRACIÓN',Cargo:'Jefatura de unidad',DirJefatura:'UNIDAD SELECCIONADA DE LA JEFATURA',FONO:'912345678',CORREO:'demo@example.test',tieneLicencia:false}};
  casos.extenso={...casos.ejemplo,funcion:'Atención y orientación de público en las unidades municipales. '.repeat(16),informe_glosa:Array.from({length:100},(_,i)=>'Actividad '+(i+1)+': Se revisaron antecedentes administrativos y se actualizaron los registros de seguimiento del periodo.').join('\n')};
  for(const [name,data] of Object.entries(casos)){
   const html=crearHTML(data);fs.writeFileSync(path.join(base,'cloud-run/plantilla-html',name+'.html'),html);
   const page=await browser.newPage();await page.setContent(html,{waitUntil:'load'});await page.waitForFunction(()=>window.templateReady || window.templateError);
   const error=await page.evaluate(()=>window.templateError);if(error)throw new Error(error);
   const result=await page.evaluate(()=>({pages:document.querySelectorAll('.page').length,overflows:Array.from(document.querySelectorAll('.block')).filter(el=>el.getBoundingClientRect().bottom>el.parentElement.getBoundingClientRect().top+818*96/72+1).map(el=>el.id)}));
   if(result.overflows.length)throw new Error('Desbordamiento: '+JSON.stringify(result));
   await page.pdf({path:path.join(base,'output/pdf','informe-html-'+name+'.pdf'),printBackground:true,preferCSSPageSize:true});
   console.log(name,JSON.stringify(result));await page.close();
  }
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
