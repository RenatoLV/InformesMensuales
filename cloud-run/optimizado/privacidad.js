const {campos}=require('../plantilla-html/plantilla');
/** Segunda barrera en Cloud: elimina datos antes de crear el DOM/PDF, aunque falle el adaptador. */
function transparenciaSegura(privado, publico) {
  const marcador='[[RESERVADO]]';
  const rut=String(privado.Rut || '').replace(/[.\s]/g,'').toUpperCase(),partes=rut.split('-');
  const cuerpo=partes[0], dv=partes[1] || '';
  const sinCero=cuerpo.replace(/^0+/,'');
  const fono=String(privado.FONO || '').replace(/\D/g,'');
  const sensibles=[privado.Rut,rut,rut.replace('-',''),cuerpo&&dv?cuerpo.replace(/(\d)(?=(\d{3})+$)/g,'$1.')+'-'+dv:'',
    sinCero&&dv ? sinCero+'-'+dv : '',sinCero&&dv ? sinCero+dv : '',sinCero&&dv ? sinCero.replace(/(\d)(?=(\d{3})+$)/g,'$1.')+'-'+dv : '',
    privado.fecha,String(privado.fecha || '').replace(/\//g,'-'),privado.FONO,fono,privado.CORREO,
    privado.LICENCIA,privado.ENFERMEDAD].filter(t=>typeof t==='string' && t.trim().length>=3 && !/^(NO PRESENTA|DATOS RESERVADOS|\[\[RESERVADO\]\])$/i.test(t.trim()));
  sensibles.sort((a,b)=>b.length-a.length);
  function censurar(texto){let valor=String(texto || '');for(const t of sensibles)valor=valor.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),marcador);return valor;}
  const salida=Object.fromEntries(campos.map(c=>[c,censurar(publico[c])]));
  Object.assign(salida,{transparencia:true,Rut:'',fecha:'',FONO:'',CORREO:''});
  // Salud nunca se toma de texto supuestamente público sin comprobarlo.
  for(const c of ['LICENCIA','ENFERMEDAD']) salida[c]=!privado[c] || /^NO PRESENTA$/i.test(privado[c]) ? 'NO PRESENTA' : marcador;
  if (Array.isArray(publico.lineasActividades)) salida.lineasActividades=publico.lineasActividades.map(l=>{
    const texto=l.segmentos.map(s=>s.texto).join(''), seguro=censurar(texto);
    return {atributos:l.atributos,segmentos:seguro===texto ? l.segmentos : [{texto:seguro,atributos:{}}]};
  });
  return salida;
}
module.exports={transparenciaSegura};
