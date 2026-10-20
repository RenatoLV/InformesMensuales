/** Formato limitado a texto: no admite HTML ejecutable, imágenes ni enlaces. */
function validarFormatoActividades_(valor, texto) {
    if (!valor) return null;
    if (typeof valor !== 'string' || valor.length > 200000) throw new Error('El formato de actividades es demasiado grande.');
    let delta;
    try { delta = JSON.parse(valor); } catch(e) { throw new Error('Formato de actividades inválido.'); }
    if (!delta || !Array.isArray(delta.ops) || delta.ops.length > 2000) throw new Error('Formato de actividades inválido.');
    const fuentes = ['sans-serif', 'serif', 'monospace', 'arial', 'georgia', 'courier', 'times-new-roman', 'tahoma', 'trebuchet', 'verdana'];
    const ops = delta.ops.map(op => {
        if (!op || typeof op.insert !== 'string' || op.retain !== undefined || op.delete !== undefined) throw new Error('Las actividades solo admiten texto.');
        const a = op.attributes || {}, limpio = {};
        ['bold', 'italic', 'underline', 'strike'].forEach(k => { if (a[k] === true) limpio[k] = true; });
        ['color', 'background'].forEach(k => { if (/^#[0-9a-f]{6}$/i.test(a[k] || '')) limpio[k] = a[k]; });
        if (fuentes.includes(a.font)) limpio.font = a.font;
        if (['small', 'large', 'huge'].includes(a.size)) limpio.size = a.size;
        if ([1, 2, 3].includes(a.header)) limpio.header = a.header;
        if (['ordered', 'bullet'].includes(a.list)) limpio.list = a.list;
        if (['center', 'right', 'justify'].includes(a.align)) limpio.align = a.align;
        if (Number.isInteger(a.indent) && a.indent >= 0 && a.indent <= 8) limpio.indent = a.indent;
        return {insert: op.insert, attributes: limpio};
    });
    const contenido = ops.map(op => op.insert).join('');
    if (contenido.length > 30001 || contenido.trim() !== String(texto || '').trim()) throw new Error('El formato no corresponde al texto de actividades. Abra el editor y vuelva a aplicarlo.');
    return {ops: ops};
}

function lineasFormatoActividades_(delta) {
    const lineas = [];
    let segmentos = [];
    delta.ops.forEach(op => {
        const partes = op.insert.split('\n');
        partes.forEach((texto, i) => {
            if (texto) segmentos.push({texto: texto, atributos: op.attributes});
            if (i < partes.length - 1) { lineas.push({segmentos: segmentos, atributos: op.attributes}); segmentos = []; }
        });
    });
    if (segmentos.length) lineas.push({segmentos: segmentos, atributos: {}});
    return lineas;
}

function reemplazarActividadesConFormato_(body, delta) {
    const patron = escaparRegex_('{{informe_glosa}}');
    let found = body.findText(patron);
    if (!found) return;
    const objetivos = [], vistos = new Set();
    while (found) {
        const paragraph = found.getElement().getParent();
        const ruta = [];
        let node = paragraph;
        while (node && typeof node.getParent === 'function') {
            const parent = node.getParent();
            if (!parent || typeof parent.getChildIndex !== 'function') break;
            ruta.push(parent.getChildIndex(node)); node = parent;
        }
        const clave = ruta.join('/');
        if (!vistos.has(clave)) { objetivos.push(paragraph); vistos.add(clave); }
        found = body.findText(patron, found);
    }
    const fuentes = {'sans-serif':'Arial', serif:'Times New Roman', monospace:'Courier New', arial:'Arial',
        georgia:'Georgia', courier:'Courier New', 'times-new-roman':'Times New Roman', tahoma:'Tahoma', trebuchet:'Trebuchet MS', verdana:'Verdana'};
    const A = DocumentApp.Attribute;
    // Una plantilla puede repetir el marcador en distintas secciones o tablas.
    objetivos.reverse().forEach(paragraph => {
        const parent = paragraph.getParent();
        let index = parent.getChildIndex(paragraph);
        const textoAnterior = paragraph.getText();
        const posicion = textoAnterior.indexOf('{{informe_glosa}}');
        const prefijo = textoAnterior.slice(0, posicion), sufijo = textoAnterior.slice(posicion + '{{informe_glosa}}'.length);
        const lineas = lineasFormatoActividades_(delta);
        const numeros = {};
        lineas.forEach((linea, i) => {
            const a = linea.atributos, nivel = a.indent || 0;
            const nueva = parent.insertParagraph(index++, '');
            const alineacion = {center:'CENTER', right:'RIGHT', justify:'JUSTIFY'}[a.align] || 'LEFT';
            nueva.setAlignment(DocumentApp.HorizontalAlignment[alineacion]);
            nueva.setIndentStart(nivel * 18);
            nueva.setIndentFirstLine(nivel * 18);
            nueva.setSpacingAfter(6);
            let marcador = '';
            if (a.list === 'ordered') {
                numeros[nivel] = (numeros[nivel] || 0) + 1;
                Object.keys(numeros).forEach(k => { if (Number(k) > nivel) delete numeros[k]; });
                marcador = numeros[nivel] + '. ';
            } else {
                Object.keys(numeros).forEach(k => delete numeros[k]);
                if (a.list === 'bullet') marcador = '• ';
            }
            const segmentos = [];
            if (i === 0 && prefijo) segmentos.push({texto:prefijo, atributos:{}});
            if (marcador) segmentos.push({texto:marcador, atributos:{}});
            segmentos.push(...linea.segmentos);
            if (i === lineas.length-1 && sufijo) segmentos.push({texto:sufijo, atributos:{}});
            segmentos.forEach(segmento => {
                const estilo = segmento.atributos;
                const attr = {};
                attr[A.FONT_FAMILY] = fuentes[estilo.font] || 'Arial';
                attr[A.FONT_SIZE] = a.header ? {1:18, 2:15, 3:13}[a.header] : {small:9, large:14, huge:18}[estilo.size] || 11;
                attr[A.BOLD] = !!(estilo.bold || a.header);
                attr[A.ITALIC] = !!estilo.italic;
                attr[A.UNDERLINE] = !!estilo.underline;
                attr[A.STRIKETHROUGH] = !!estilo.strike;
                attr[A.FOREGROUND_COLOR] = estilo.color || '#000000';
                if (estilo.background) attr[A.BACKGROUND_COLOR] = estilo.background;
                const inicio = nueva.getText().length;
                nueva.appendText(segmento.texto);
                nueva.editAsText().setAttributes(inicio, inicio+segmento.texto.length-1, attr);
            });
        });
        paragraph.removeFromParent();
    });
}
