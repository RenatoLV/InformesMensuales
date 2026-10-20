const fs = require('node:fs');
const path = require('node:path');
const {actividadesHTML} = require('./formato');
const assets = new Map();
const asset = (name,type) => {
  if (!assets.has(name)) assets.set(name, `data:${type};base64,${fs.readFileSync(path.join(__dirname,'assets',name)).toString('base64')}`);
  return assets.get(name);
};
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const campos = ['mes','anio','Nombre','Rut','Direccion','Programa','funcion','fecha','periodoMes','periodoFinMes','informe_glosa','Dificultades_glosa','LICENCIA','ENFERMEDAD','VACACIONES','Jefatura','Cargo','DirJefatura','FONO','CORREO'];
const referencia = Object.fromEntries(campos.map(c=>[c,c==='anio'?'2026':`{{${c}}}`]));

/** Plantilla institucional. La paginación ajusta el espacio, no recorta el contenido. */
function crearHTML(datos = referencia, opciones = {}) {
  const recurso = opciones.asset || asset;
  const publico = datos.transparencia === true;
  if (publico) datos = {...datos, Rut:'', fecha:'', FONO:'', CORREO:'', tieneLicencia:undefined};
  const d = Object.fromEntries(campos.map(c=>[c,escape(datos[c] ?? '')]));
  const franja = '<span class="redaction" aria-label="Dato reservado"></span>';
  if (publico) Object.keys(d).forEach(c=>{d[c]=d[c].split('[[RESERVADO]]').join(franja);});
  const texto = c => d[c].replace(/\r\n?/g,'\n').split('\n').map(linea=>`<p>${linea || '<br>'}</p>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe mensual de actividades</title>
<style>
@font-face{font-family:Institucional;src:url('${recurso('Arial-compatible.ttf','font/ttf')}')}
@font-face{font-family:Institucional;src:url('${recurso('Arial-compatible-bold.ttf','font/ttf')}');font-weight:700}
@page{size:609pt 893pt;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#eee;color:#000;font-family:Institucional,Arial,sans-serif;font-size:12pt}
.page{width:609pt;height:893pt;position:relative;background:#fff;margin:0 auto 20px;break-after:page;overflow:hidden}
.page:last-child{break-after:auto}.footer-art{position:absolute;left:1.2pt;top:786.702pt;width:614.25pt;height:101.25pt;z-index:0}
.redaction{display:inline-block;background:#000!important;width:100pt;height:11pt;vertical-align:middle;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.birth-redaction{width:86pt;height:10pt}.signature-redaction{position:absolute;left:12%;right:12%;top:10pt;height:30pt;background:#000!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}.signature-cell{position:relative}
#review-sign .signature-redaction{left:7%;right:7%;top:7pt;height:52pt}
.positioned{position:absolute;z-index:1}.logos{left:58.2pt;top:42.499pt;width:157.5pt;height:88.5pt}
.title{left:56.7pt;top:175.7pt;width:465pt;text-align:center;font-weight:700;line-height:13.8pt}
.antecedentes{left:74.7pt;top:230.8pt;font-weight:700;line-height:13.8pt}
.licencia{left:437.5pt;top:73.5pt;width:121pt;border:1pt solid #000;font-weight:700;text-align:center}
.licencia-title{height:22pt;line-height:24pt;font-size:10pt;border-bottom:1pt solid #000}
.licencia-options{display:flex;height:26pt;border-bottom:1pt solid #000;font-size:11pt;align-items:center}
.licencia-options>div{width:50%;height:100%;display:flex;align-items:center;justify-content:center;gap:7pt;padding-top:4pt;padding-left:17pt}
.licencia-options>div+div{border-left:1pt solid #000}.checkbox{width:8pt;height:8pt;border:1pt solid #666;border-radius:1pt;display:inline-block}
.licencia-date{height:33pt;padding-top:6pt;font-size:9pt;line-height:10.5pt}.licencia-date strong{font-size:10pt}
.block{position:absolute;z-index:1;line-height:13.8pt}.block p{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}
.fields{font-size:11pt;line-height:12.7pt;width:500pt}.fields strong{font-weight:400}.fields div:last-child{font-size:10.5pt;line-height:12pt}.fields div{overflow-wrap:anywhere;min-height:13.8pt}.fields u{text-decoration:underline;text-underline-offset:1pt}
.period{width:500pt;border:1pt solid #000;font-weight:700}.period-title{height:15pt;padding-left:4pt;line-height:15pt;border-bottom:1pt solid #000}
.period-values,.period-labels{display:grid;grid-template-columns:253pt 1fr;text-align:center}.period-values{min-height:36pt}.period-values>div{font-weight:400;font-size:11pt;display:flex;align-items:center;justify-content:center;padding:4pt;overflow-wrap:anywhere}
.period-values>div+div{border-left:1pt solid #000;padding-left:22.6pt}.period-labels{height:14pt;line-height:14pt;border-top:1pt solid #000}
.activity-heading{margin-left:25.2pt;font-weight:700;line-height:13.8pt;margin-bottom:13.4pt}.activity-heading span{display:block;margin-left:28.5pt}
#activities .frame{font-size:11.5pt;line-height:13.2pt}.frame{border:1pt solid #000;padding:1.5pt 3.2pt;overflow-wrap:anywhere;min-height:164pt}.difficulty-heading{font-size:11pt;font-weight:700;line-height:12.65pt;margin-left:5.2pt;margin-bottom:12.15pt}
.difficulty-heading span{display:block;margin-left:21.38pt}.difficulty-frame{min-height:27pt;font-size:11pt;font-weight:400;padding-left:4.5pt}.observations-heading{font-weight:700;margin-left:4.2pt;line-height:14pt}.observations-frame{min-height:44pt;display:flex;align-items:center;padding-left:4.2pt}
.red{color:#ff0000}.leave-title{font-weight:700;line-height:15.3pt;padding-left:4.2pt}.leave-box{border:1pt solid #000;padding:1.5pt 4.2pt;font-weight:400;line-height:13.8pt;min-height:85pt}
.leave-box .red{font-weight:700}.leave-box .gap{height:13.2pt}.sign-table{font-size:11pt;border:1pt solid #000;font-weight:400;text-align:center}.employee-grid{display:grid;grid-template-columns:237pt 1fr}
.employee-grid .cell{min-height:56pt;display:flex;align-items:flex-end;justify-content:center;padding:0 8pt;overflow-wrap:anywhere}.employee-grid .cell:first-child{align-items:center;padding-top:13.8pt}
.employee-grid .cell+.cell{border-left:1pt solid #000}.employee-labels{display:grid;grid-template-columns:237pt 1fr;border-top:1pt solid #000;line-height:14pt;min-height:14pt}
.employee-labels>div+div{border-left:1pt solid #000}.review-title{margin-left:18.2pt;line-height:13.8pt;white-space:nowrap}.review-title strong{margin-left:7pt}
.review-grid{display:grid;grid-template-columns:215pt 1fr}.review-grid .cell{min-height:70pt;display:flex;flex-direction:column;justify-content:center;padding:10pt;overflow-wrap:anywhere}
.review-grid .cell+.cell{border-left:1pt solid #000}.review-labels{display:grid;grid-template-columns:215pt 1fr;border-top:1pt solid #000;min-height:42pt;align-items:stretch;font-size:11pt}
.review-labels>div{display:flex;align-items:center;justify-content:center}.review-labels>div+div{border-left:1pt solid #000}.contact{font-weight:400;font-size:11pt;line-height:14pt;overflow-wrap:anywhere}.contact p+p{margin-top:11.4pt}
.continuation-title{position:absolute;left:56.7pt;top:30pt;font-weight:700;font-size:10pt}
@media print{html,body{background:#fff}.page{margin:0}}
</style></head><body>
<section class="page" id="first-page"><img class="footer-art" alt="Pie institucional Municipalidad de Coquimbo" src="${recurso('pie.png','image/png')}"><img class="positioned logos" alt="Logos originales Municipalidad de Coquimbo" src="${recurso('logos.png','image/png')}">
<div class="positioned licencia"><div class="licencia-title">LICENCIA</div><div class="licencia-options"><div><span class="checkbox">${datos.tieneLicencia===true?'✓':''}</span>SI</div><div><span class="checkbox">${datos.tieneLicencia===false?'✓':''}</span>NO</div></div><div class="licencia-date">Fecha de nacimiento<br><strong>${publico ? '<span class="redaction birth-redaction" aria-label="Fecha reservada"></span>' : d.fecha}</strong></div></div>
<div class="positioned title">INFORME MENSUAL ACTIVIDADES<br>ILUSTRE MUNICIPALIDAD DE COQUIMBO<br>MES DE ${d.mes} ${d.anio}</div><div class="positioned antecedentes">1.&nbsp; ANTECEDENTES:</div>
<div id="fields" class="block fields"><div><u>Nombre:</u> <strong>${d.Nombre}</strong></div><div><u>RUT:</u>&nbsp; <strong>${publico ? franja : d.Rut}</strong></div><div><u>Lugar de Desempeño:</u> <strong>${d.Direccion}</strong></div><div><u>Nombre del Proyecto:</u> <strong>${d.Programa}</strong></div><div><u>Función Establecida en el Contrato:</u> <strong>${d.funcion}</strong></div></div>
<div id="period" class="block period"><div class="period-title">PERÍODO QUE CUBRE INFORME:</div><div class="period-values"><div>${d.periodoMes}</div><div>${d.periodoFinMes}</div></div><div class="period-labels"><div>DESDE</div><div>HASTA</div></div></div>
<div id="activities" class="block"><div class="activity-heading">2.- INFORME DE AVANCE MENSUAL<span>ACTIVIDADES y AVANCES:</span></div><div class="frame">${actividadesHTML(datos) || texto('informe_glosa')}</div></div>
<div id="difficulty" class="block"><div class="difficulty-heading">2.1 DIFICULTADES PARA LOGRO DE LAS FUNCIONES COMPROMETIDAS Y<span>PROPUESTAS PARA SOLUCIONARLAS:</span></div><div class="frame difficulty-frame">${texto('Dificultades_glosa')}</div></div>
<div id="observations" class="block"><div class="observations-heading">2.2. OBSERVACIONES, SUGERENCIAS:</div><div class="frame observations-frame">No hay observaciones.</div></div></section>
<section class="page" id="second-page"><img class="footer-art" alt="Pie institucional" src="${recurso('pie.png','image/png')}">
<div id="leave" class="block"><div class="leave-title red">2.3.&nbsp; LICENCIAS Y VACACIONES:</div><div class="leave-box"><p><span class="red">PERIODOS DE LICENCIAS:</span>${d.LICENCIA}</p><div class="gap"></div><p><span class="red">REPOSO ACCIDENTE LABORAL:</span> ${d.ENFERMEDAD}</p><p class="red" style="font-size:10pt">(ENFERMEDAD PROFESIONAL Ó TRAYECTO)</p><div class="gap"></div><p><span class="red">VACACIONES:</span> ${d.VACACIONES}</p></div></div>
<div id="employee-sign" class="block sign-table"><div class="employee-grid"><div class="cell">${d.mes} ${d.anio}</div><div class="cell signature-cell">${publico ? '<div class="signature-redaction" aria-label="Firma reservada"></div>' : ''}${d.Nombre}</div></div><div class="employee-labels"><div>Fecha Informe</div><div>Nombre y Firma persona contratada</div></div></div>
<div id="review-heading" class="block review-title">2.<strong>REVISIÓN Y CERTIFICAR CONFORME DEL PRESENTE INFORME</strong></div>
<div id="review-sign" class="block sign-table"><div class="review-grid"><div class="cell">${d.Jefatura}<br>${d.Cargo}<br>${d.DirJefatura}</div><div class="cell signature-cell">${publico ? '<div class="signature-redaction" aria-label="Firma reservada"></div>' : ''}</div></div><div class="review-labels"><div>CERTIFICACIÓN DE CUMPLIMIENTO</div><div>Firma</div></div></div>
${publico ? '' : '<div id="contact" class="block contact"><p>CONTACTO:'+d.FONO+'</p><p>'+d.CORREO+'</p></div>'}</section>
<script>
const PT=96/72; const height=el=>el.getBoundingClientRect().height/PT;
function position(el,page,x,y,w){page.append(el);Object.assign(el.style,{left:x+'pt',top:y+'pt',width:w+'pt'});}
function continuation(before){const page=document.createElement('section');page.className='page';page.innerHTML=document.querySelector('.footer-art').outerHTML+'<div class="continuation-title">INFORME MENSUAL ACTIVIDADES · CONTINUACIÓN</div>';document.body.insertBefore(page,before);return page;}
function layoutGroup(page,items,start,before){let y=start;
 for(const [id,x,w,gap] of items){const el=document.getElementById(id);if(!el)continue;y+=gap;position(el,page,x,y,w);
   if(id==='activities'){const result=layoutActivities(el,page,y,before);page=result.page;y=result.y;continue;}
   if(height(el)>770) throw new Error('Un bloque supera el espacio de una página: '+id);
   if(y+height(el)>818){page=continuation(before);y=52;position(el,page,x,y,w);}
   y+=height(el);
 }
 return {page,y};
}
function layoutActivities(el,page,y,before){let frame=el.querySelector('.frame');
 if(y+height(el)<=818)return {page,y:y+height(el)};
 const paragraphs=Array.from(frame.children);frame.replaceChildren();frame.style.minHeight='0';
 let target=frame,block=el,limit=818-y-height(el);
 const next=()=>{page=continuation(before);y=52;block=document.createElement('div');block.className='block';block.innerHTML='<div class="activity-heading">ACTIVIDADES y AVANCES: CONTINUACIÓN</div><div class="frame"></div>';position(block,page,49.5,y,507);target=block.querySelector('.frame');target.style.minHeight='0';limit=818-y-height(block);};
 if(limit<60){el.remove();next();}
 // Conservar los elementos padre evita perder negrita/color cuando el corte cae dentro de un span.
 function slice(source,start,end){const p=source.cloneNode(true),walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),nodes=[];let n,total=0;
  while(n=walker.nextNode()){nodes.push({n,start:total,end:total+n.length});total+=n.length;}
  for(const v of nodes){v.n.textContent=v.n.textContent.slice(Math.max(0,start-v.start),Math.max(0,Math.min(v.n.length,end-v.start)));}
  if(!total && !p.children.length)p.append(document.createElement('br'));return p;
 }
 for(const source of paragraphs){let remainder=source.textContent,offset=0;
  do{let p=slice(source,offset,offset+remainder.length);target.append(p);
   if(height(target)<=limit)break;
   p.remove();let low=0,high=remainder.length;
   while(low<high){const mid=Math.ceil((low+high)/2);p=slice(source,offset,offset+mid);target.append(p);const fits=height(target)<=limit;p.remove();if(fits)low=mid;else high=mid-1;}
   let cut=low;const space=remainder.lastIndexOf(' ',cut);if(space>cut*.7)cut=space+1;
   if(cut===0 && target.children.length===0) throw new Error('Un párrafo de actividades no cabe en una página');
   if(cut>0){p=slice(source,offset,offset+cut);target.append(p);offset+=cut;remainder=remainder.slice(cut);}
   next();
  }while(remainder.length);
 }
 return {page,y:y+height(block)};
}
document.fonts.ready.then(()=>{
 const first=layoutGroup(document.getElementById('first-page'),[['fields',56.7,500,0],['period',52.5,500,13.2],['activities',49.5,507,14.1],['difficulty',51.5,502,28.3],['observations',52.5,470,14.9]],258.3,document.getElementById('second-page'));
 const second=document.getElementById('second-page');
 // Continuar con licencias y firmas en la última hoja de contenido evita una hoja extra casi vacía.
 const continued=first.page.id!=='first-page';
 layoutGroup(continued?first.page:second,[['leave',52.5,499,0],['employee-sign',56.5,500,12.85],['review-heading',56.5,500,14.3],['review-sign',56.5,500,12.8],['contact',56.7,500,41.25]],continued?first.y+18:42.25,null);
 if(continued)second.remove();
 window.templateReady=true;
}).catch(error=>{window.templateError=error.message;});
</script></body></html>`;
}
module.exports={crearHTML,referencia,campos};
