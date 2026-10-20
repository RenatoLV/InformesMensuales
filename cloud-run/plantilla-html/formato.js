const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function actividadesHTML(datos) {
  const lineas = datos.lineasActividades;
  if (!lineas) return null;
  if (!Array.isArray(lineas) || lineas.length > 30001) throw new Error('Formato de actividades inválido');
  const texto = lineas.map(l=>l.segmentos.map(s=>s.texto).join('')).join('\n');
  if (texto.trim() !== String(datos.informe_glosa || '').trim()) throw new Error('Formato y texto no coinciden');
  let numero=0;
  return lineas.map(l=>{
    const a=l.atributos || {}, estilos=[];
    if (['center','right','justify'].includes(a.align)) estilos.push('text-align:'+a.align);
    if (Number.isInteger(a.indent) && a.indent>0 && a.indent<=8) estilos.push('padding-left:'+a.indent*12+'pt');
    if ([1,2,3].includes(a.header)) estilos.push('font-weight:700;font-size:'+({1:18,2:16,3:14}[a.header])+'pt;line-height:1.25');
    const prefijo=a.list==='ordered' ? ++numero+'. ' : a.list==='bullet' ? '• ' : '';
    if (!a.list) numero=0;
    const contenido=l.segmentos.map(s=>{
      if (typeof s.texto !== 'string') throw new Error('Segmento de actividades inválido');
      const at=s.atributos || {}, css=[];
      if (at.bold===true) css.push('font-weight:700');
      if (at.italic===true) css.push('font-style:italic');
      const decor=[at.underline===true?'underline':'',at.strike===true?'line-through':''].filter(Boolean);
      if (decor.length) css.push('text-decoration:'+decor.join(' '));
      if (/^#[0-9a-f]{6}$/i.test(at.color || '')) css.push('color:'+at.color);
      if (/^#[0-9a-f]{6}$/i.test(at.background || '')) css.push('background-color:'+at.background);
      if (['small','large','huge'].includes(at.size)) css.push('font-size:'+({small:10,large:16,huge:20}[at.size])+'pt;line-height:1.25');
      // Solo familias conocidas; sin CSS ni URLs recibidas del cliente.
      const fonts={'sans-serif':'Institucional','arial':'Institucional',serif:'serif',monospace:'monospace',georgia:'Georgia',courier:'monospace','times-new-roman':'serif',tahoma:'Tahoma',trebuchet:'Trebuchet MS',verdana:'Verdana'};
      if (fonts[at.font]) css.push('font-family:'+fonts[at.font]);
      const texto=escape(s.texto);
      return '<span style="'+css.join(';')+'">'+(datos.transparencia===true ? texto.split('[[RESERVADO]]').join('<span class="redaction" aria-label="Dato reservado"></span>') : texto)+'</span>';
    }).join('');
    return '<p style="'+estilos.join(';')+'">'+prefijo+(contenido || '<br>')+'</p>';
  }).join('');
}
module.exports={actividadesHTML};
