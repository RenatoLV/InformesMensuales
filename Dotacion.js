/** Caché de UNA fila por funcionario: no intenta guardar toda la nómina en 100 KB. */
function leerFilaDotacion_(sheet, rut) {
    const canon = normalizarRutCanonical_(rut);
    if (!canon) return null;
    const cache = CacheService.getScriptCache();
    const clave = 'DOTACION_V4_' + sheet.getSheetId() + '_' + canon;
    const cached = cache.get(clave);
    if (cached) { try { return JSON.parse(cached); } catch(e) { cache.remove(clave); } }
    const claveIndice = 'INDICE_DOTACION_V2_' + sheet.getSheetId();
    let indice;
    const previo = cache.get(claveIndice);
    if (previo) { try { indice = JSON.parse(previo); } catch(e) {} }
    // Una fila puede moverse al ordenar la nómina: verificar el RUT y reconstruir una sola vez.
    let fila;
    for (let intento = 0; intento < 2; intento++) {
        if (!indice) indice = crearIndiceDotacion_(sheet, cache, claveIndice);
        if (!indice || !indice.filas[canon]) return null;
        if (indice.filas[canon] === -1) throw new Error('Hay más de una fila de nómina compatible con este RUT. Informática debe revisar los registros.');
        fila = sheet.getRange(indice.filas[canon], 1, 1, indice.cols).getValues()[0];
        if (variantesRutNomina_(fila[indice.colRut]).includes(canon)) break;
        cache.remove(claveIndice); indice = null; fila = null;
    }
    if (!fila) throw new Error('La nómina cambió durante la consulta. Vuelva a intentarlo.');
    fila = fila.map(v => v instanceof Date ? Utilities.formatDate(v, CONFIG.TIMEZONE, 'dd/MM/yyyy') : v);
    const resultado = [indice.header, fila];
    const json = JSON.stringify(resultado);
    if (Utilities.newBlob(json).getBytes().length < 90000) cache.put(clave, json, 300);
    return resultado;
}

function crearIndiceDotacion_(sheet, cache, clave) {
    const last = sheet.getLastRow(), cols = sheet.getLastColumn();
    if (!last) return null;
    const cabeceras = sheet.getRange(1, 1, Math.min(10, last), cols).getDisplayValues();
    let idx = -1, colRut = -1;
    for (let i = 0; i < cabeceras.length; i++) {
        colRut = cabeceras[i].map(v => String(v).trim().toUpperCase()).indexOf('RUT');
        if (colRut >= 0) { idx = i; break; }
    }
    if (idx < 0) throw new Error('No se encontró la columna RUT en la dotación.');
    const indice = {cols:cols, colRut:colRut, header:cabeceras[idx], filas:{}};
    const count = last - idx - 1;
    if (count > 0) sheet.getRange(idx+2, colRut+1, count, 1).getDisplayValues().forEach((row,i) => {
        variantesRutNomina_(row[0]).forEach(rut => {
            const numeroFila = idx + 2 + i;
            if (indice.filas[rut] && indice.filas[rut] !== numeroFila) indice.filas[rut] = -1;
            else indice.filas[rut] = numeroFila;
        });
    });
    const json = JSON.stringify(indice);
    try { if (Utilities.newBlob(json).getBytes().length < 90000) cache.put(clave,json,120); } catch(e) {}
    return indice;
}
