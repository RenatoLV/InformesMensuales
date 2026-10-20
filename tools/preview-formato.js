// Revisión local del formato. Solo datos ficticios; no usa Cloud, Apps Script ni Drive.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {crearHTML,referencia}=require('../cloud-run/plantilla-html/plantilla');
const {transparenciaSegura}=require('../cloud-run/optimizado/privacidad');
const base=path.resolve(__dirname,'..');
const datos={mes:'OCTUBRE',anio:'2026',Nombre:'FUNCIONARIO DE DEMOSTRACIÓN',Rut:'12.345.678-5',Direccion:'DIRECCIÓN DE RECURSOS HUMANOS',Programa:'HONORARIOS',
 funcion:'Apoyo administrativo y atención municipal.',fecha:'01/01/1990',periodoMes:'01/10/2026',periodoFinMes:'31/10/2026',
 informe_glosa:'Atención municipal\nSe revisaron antecedentes y se atendieron las consultas del periodo.\nSe actualizaron los registros de seguimiento.',Dificultades_glosa:'Sin dificultades.',
 LICENCIA:'NO PRESENTA',ENFERMEDAD:'NO PRESENTA',VACACIONES:'NO PRESENTA',Jefatura:'JEFATURA DE DEMOSTRACIÓN',Cargo:'Jefatura de unidad',DirJefatura:'UNIDAD SELECCIONADA DE LA JEFATURA',FONO:'912345678',CORREO:'demo@example.test',tieneLicencia:false};
const vistas={'/plantilla':crearHTML(referencia),'/remuneraciones':crearHTML(datos),'/transparencia':crearHTML(transparenciaSegura(datos,datos))};
const salida=path.join(base,'output/revision-formato');fs.mkdirSync(salida,{recursive:true});
for(const [ruta,html] of Object.entries(vistas))fs.writeFileSync(path.join(salida,ruta.slice(1)+'.html'),html);
const pagina=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revisión del formato de informe</title>
<style>*{box-sizing:border-box}body{margin:0;background:#e8edf2;font:14px Arial;color:#173d50}header{background:#173d50;color:white;padding:16px 24px;border-bottom:3px solid #d7ad44}h1{font-size:20px;margin:0 0 7px}p{margin:0;line-height:1.5}nav{padding:12px 24px;display:flex;gap:8px;flex-wrap:wrap;background:white}button,a{font:inherit;border:1px solid #c5d2dc;border-radius:7px;padding:9px 14px;background:white;color:#173d50;cursor:pointer;text-decoration:none}button[aria-pressed=true]{background:#173d50;color:white}main{display:grid;grid-template-columns:1fr;gap:12px;padding:12px;height:calc(100vh - 163px)}main.comparar{grid-template-columns:1fr 1fr}iframe{width:100%;height:100%;border:1px solid #c5d2dc;background:#eee;border-radius:6px}#original{display:none}.comparar #original{display:block}@media(max-width:900px){main.comparar{grid-template-columns:1fr}main.comparar iframe{height:80vh}main.comparar{height:auto}}</style>
<header><h1>Revisión del formato del informe</h1><p>Formato HTML aprobado · Dos páginas base · Logos originales · Ejemplo con datos ficticios</p></header>
<nav aria-label="Vistas del informe"><button aria-pressed="false" data-vista="plantilla">Plantilla sin completar</button><button aria-pressed="true" data-vista="remuneraciones">Ejemplo remuneraciones</button><button aria-pressed="false" data-vista="transparencia">Ejemplo transparencia</button><button id="comparar" aria-pressed="false">Comparar con PDF original</button><a href="/original.pdf" target="_blank" rel="noopener">Abrir PDF original</a></nav>
<main><iframe title="Diseño HTML del informe" src="/remuneraciones"></iframe><iframe id="original" title="PDF original de referencia" src="/original.pdf"></iframe></main>
<script>document.querySelectorAll('[data-vista]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-vista]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));document.querySelector('iframe').src='/'+b.dataset.vista;});document.getElementById('comparar').onclick=function(){const activo=document.querySelector('main').classList.toggle('comparar');this.setAttribute('aria-pressed',String(activo));};</script></html>`;
http.createServer((req,res)=>{
 const ruta=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Cache-Control','no-store');
 if(ruta==='/original.pdf'){const archivo='C:/Users/U-1133/Downloads/INFORME PLANTILLA.pdf';if(!fs.existsSync(archivo)){res.writeHead(404);return res.end('Referencia no encontrada');}res.setHeader('Content-Type','application/pdf');return fs.createReadStream(archivo).pipe(res);}
 if(ruta==='/' || vistas[ruta]){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(ruta==='/'?pagina:vistas[ruta]);}
 res.writeHead(404);res.end();
}).listen(Number(process.env.PREVIEW_FORMATO_PORT || 8766),'127.0.0.1',()=>console.log('Vista previa de formato disponible.'));
