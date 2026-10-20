const test=require('node:test'),assert=require('node:assert/strict');
const {crearHTML}=require('../cloud-run/plantilla-html/plantilla');
const {actividadesHTML}=require('../cloud-run/plantilla-html/formato');
test('la plantilla escapa texto y no convierte atributos del editor en HTML ejecutable',()=>{
 const datos={Nombre:'<script>alert(1)</script>',informe_glosa:'Texto <seguro>',lineasActividades:[{atributos:{align:'javascript:alert(1)'},
  segmentos:[{texto:'Texto <seguro>',atributos:{bold:true,color:'#173d50',background:'url(https://example.test)',font:'evil;display:none'}}]}]};
 const html=crearHTML(datos);
 assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert(html.includes('font-weight:700;color:#173d50'));
 assert(html.includes('Texto &lt;seguro&gt;'));
 assert(!html.includes('javascript:alert'));assert(!html.includes('https://example.test'));assert(!html.includes('evil;'));
});
test('la plantilla rechaza formato que no corresponde al texto visible',()=>{
 assert.throws(()=>actividadesHTML({informe_glosa:'Texto',lineasActividades:[{segmentos:[{texto:'Otro'}]}]}),/no coinciden/);
});
test('transparencia cubre las firmas vacías, elimina contacto y no incluye RUT ni nacimiento en el HTML',()=>{
 const html=crearHTML({transparencia:true,Nombre:'Demo',Rut:'12.345.678-5',fecha:'01/01/1990',FONO:'912345678',CORREO:'demo@example.test',informe_glosa:'Texto'});
 for(const valor of ['12.345.678-5','01/01/1990','912345678','demo@example.test','id="contact"'])assert(!html.includes(valor));
 assert.equal((html.match(/class="signature-redaction"/g)||[]).length,2);
 assert(html.includes('class="redaction birth-redaction"'));assert(html.includes('<strong><span class="redaction"'));
});
