/** Adaptador de datos del formulario al contrato HTML de Cloud. */
function datosPlantillaCloud_(d, p, privado) {
    const reservado = '[[RESERVADO]]';
    const formato = validarFormatoActividades_(d.actividadesFormato, d.actividades);
    const datos = {
        mes: p.mes, anio: String(p.anio), Nombre: d.nombre, Rut: privado ? d.rut : reservado,
        Direccion: d.direccion, Programa: d.programa, funcion: d.funcion,
        fecha: privado ? d.nacimiento : reservado, periodoMes: d.fechaInicioMes, periodoFinMes: d.fechaFinMes,
        informe_glosa: d.actividades, Dificultades_glosa: d.dificultades,
        LICENCIA: privado || !d.datoLicencia || d.datoLicencia === 'NO PRESENTA' ? d.datoLicencia || 'NO PRESENTA' : reservado,
        ENFERMEDAD: privado || !d.datoEnfermedad || d.datoEnfermedad === 'NO PRESENTA' ? d.datoEnfermedad || 'NO PRESENTA' : reservado,
        VACACIONES: d.datoVacaciones || 'NO PRESENTA', Jefatura: d.jefaturaNombre,
        Cargo: d.jefaturaCargo, DirJefatura: d.jefaturaDireccion,
        FONO: privado ? d.fono : '', CORREO: privado ? d.correo : '', transparencia: !privado
    };
    // No revela la presencia de licencia médica en la versión pública.
    if (privado) datos.tieneLicencia = !!d.datoLicencia && d.datoLicencia !== 'NO PRESENTA';
    const sensibles = privado ? [] : variantesSensibles_(d).filter(t => String(t).trim().length >= 3)
        .sort((a,b) => b.length-a.length);
    function censurar(texto) {
        let valor = String(texto || '');
        sensibles.forEach(t => { valor = valor.split(String(t)).join(reservado); });
        return valor;
    }
    // Sustituir antes de renderizar: no existe texto secreto detrás de una máscara visual.
    Object.keys(datos).forEach(k => { if (typeof datos[k] === 'string') datos[k] = censurar(datos[k]); });
    if (formato) {
        // Censurar por línea completa también cubre un RUT distribuido entre segmentos con formato.
        datos.lineasActividades = lineasFormatoActividades_(formato).map(linea => {
            const texto = linea.segmentos.map(s => s.texto).join('');
            if (censurar(texto) !== texto) return {segmentos:[{texto:censurar(texto), atributos:{}}], atributos:linea.atributos};
            return linea;
        });
    }
    return datos;
}
