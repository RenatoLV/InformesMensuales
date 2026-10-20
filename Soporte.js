/**
 * Recuperación MANUAL desde el editor, después de revisar los archivos del servicio Cloud.
 * El sufijo '_' impide invocarla desde google.script.run.
 * No vuelve a generar PDFs ni crea archivos; confirma los dos que ya existen.
 */
function confirmarArchivosCloud_(rut, mes, anio, urlRemu, urlTransp) {
    function verificar(url) {
        const match = String(url).match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\//);
        if (!match) throw new Error('Utilice el enlace de un archivo de Drive.');
        const file = Drive.Files.get(match[1], { fields: 'id,mimeType,parents,trashed', supportsAllDrives: true });
        if (file.trashed || file.mimeType !== 'application/pdf') throw new Error('El archivo debe ser un PDF disponible.');
        return file;
    }
    const remu = verificar(urlRemu), transp = verificar(urlTransp);
    if (remu.id === transp.id) throw new Error('Las dos versiones deben ser archivos distintos.');
    return conBloqueoInformes_(function() {
        const p = resolverPeriodo_(mes, anio);
        const sheet = hojaInformes_();
        const fila = buscarFilaInforme_(sheet, rut, p.mes, p.anio);
        if (!fila) throw new Error('No existe una operación para este funcionario y periodo.');
        if (String(fila.valores[5]).indexOf('FINALIZADO') >= 0) throw new Error('Este periodo ya está cerrado.');
        const control = leerControl_(fila);
        const ids = control.archivos || {};
        if (!ids.cloudPendiente) throw new Error('Esta operación no tiene una respuesta Cloud pendiente de confirmar.');
        if (!ids.folderRemu || !ids.folderTransp || remu.parents.indexOf(ids.folderRemu) < 0 || transp.parents.indexOf(ids.folderTransp) < 0) {
            throw new Error('Los archivos no corresponden a las carpetas reservadas por esta operación.');
        }
        const clave = p.anio + '_' + p.mes + '_' + normalizarRutCanonical_(rut);
        const props = PropertiesService.getScriptProperties();
        const activos = JSON.parse(props.getProperty('INFORMES_ACTIVOS') || '{}');
        if (activos[clave] && activos[clave].vence > Date.now()) throw new Error('La ejecución todavía puede estar activa.');
        ids.urlRemu = urlRemu; ids.urlTransp = urlTransp; ids.cloudPendiente = false;
        control.fase = 'CONFIRMADO POR SOPORTE'; control.error = ''; control.actualizado = new Date().toISOString();
        agregarEventoOperacion_(control, control.fase);
        registrarEnLogSinBloqueo_({ rut: rut, mes: p.mes, anio: p.anio,
            estado: 'GENERADO (PENDIENTE FIRMA)', linkRemu: urlRemu, linkTransp: urlTransp }, control);
        delete activos[clave]; props.setProperty('INFORMES_ACTIVOS', JSON.stringify(activos));
        return { exito: true };
    });
}
