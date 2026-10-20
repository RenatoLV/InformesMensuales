/** Recepción administrativa: ningún endpoint opera sin identidad y lista de acceso. */
function exigirAdministradorRecepcion_() {
    const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    const permitidos = String(PropertiesService.getScriptProperties().getProperty('RECEPCION_ADMIN_EMAILS') || '')
        .split(/[,;\n]/).map(x => x.trim().toLowerCase()).filter(Boolean);
    // No usar getEffectiveUser: en la web pública sería el publicador, no el visitante.
    if (!email || !permitidos.includes(email)) throw new Error('ACCESO_DENEGADO: Ingrese con una cuenta autorizada para recepción masiva.');
    return email;
}

function obtenerCatalogoRecepcionMasiva() {
    const email = exigirAdministradorRecepcion_();
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    const nombreHoja = obtenerNombreHojaMasReciente_(ss);
    if (!nombreHoja) throw new Error('No existe una nómina vigente.');
    const datos = ss.getSheetByName(nombreHoja).getDataRange().getDisplayValues();
    const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
    const cabecera = datos.slice(0, 10).findIndex(row => row.map(normalizar).includes('RUT'));
    if (cabecera < 0) throw new Error('No se encontró RUT en la nómina.');
    const h = datos[cabecera].map(normalizar), cr = h.indexOf('RUT');
    let cn = h.indexOf('NOMBRE COMPLETO');
    if (cn < 0) cn = h.findIndex(x => x.includes('NOMBRE') && x.includes('COMPLETO'));
    const nombres = h.indexOf('NOMBRES'), apellidos = h.indexOf('APELLIDOS');
    if (cn < 0 && (nombres < 0 || apellidos < 0)) throw new Error('No se encontró el nombre completo en la nómina.');
    const personas = [];
    datos.slice(cabecera + 1).forEach(row => {
        const nombre = String(cn >= 0 ? row[cn] : row[nombres] + ' ' + row[apellidos]).trim();
        if (!nombre) return;
        // Conservar las ambigüedades de origen, no adjudicar silenciosamente una identidad.
        variantesRutNomina_(row[cr]).forEach(rut => { if (rutRecepcionValido_(rut)) personas.push({ rut: rut, nombre: nombre }); });
    });
    return { email: email, nomina: nombreHoja, personas: personas,
        anio: Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy')),
        mes: Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM')) };
}

function rutRecepcionValido_(valor) {
    const rut = String(valor || '').replace(/[.\s]/g, '').toUpperCase();
    const m = rut.match(/^(\d{7,8})-([0-9K])$/);
    if (!m || !Number(m[1])) return false;
    let suma = 0, factor = 2;
    for (let i = m[1].length - 1; i >= 0; i--) { suma += Number(m[1][i]) * factor; factor = factor === 7 ? 2 : factor + 1; }
    const resto = 11 - suma % 11;
    return m[2] === (resto === 11 ? '0' : resto === 10 ? 'K' : String(resto));
}

function idCarpetaRecepcion_(valor) {
    const texto = String(valor || '').trim();
    const match = texto.match(/^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/)([A-Za-z0-9_-]+)(?:[?#].*)?$/);
    const id = match ? match[1] : texto;
    if (!/^[A-Za-z0-9_-]{10,150}$/.test(id)) throw new Error('Ingrese el enlace o ID de una carpeta de Google Drive.');
    return id;
}

/** Una página por RPC: no recorrer 3.706 archivos dentro de una única ejecución. */
function listarCarpetaRecepcionMasiva(carpeta, pagina) {
    exigirAdministradorRecepcion_();
    const id = idCarpetaRecepcion_(carpeta);
    if (pagina && (typeof pagina !== 'string' || pagina.length > 3000)) throw new Error('Página inválida.');
    const folder = Drive.Files.get(id, { fields: 'id,mimeType,trashed,driveId', supportsAllDrives: true });
    if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder') throw new Error('La carpeta no está disponible.');
    const opciones = { q: "'" + id + "' in parents and trashed = false and mimeType = 'application/pdf'",
        pageSize: 100, orderBy: 'name', fields: 'nextPageToken,incompleteSearch,files(id,name,size,mimeType,modifiedTime,version,md5Checksum)',
        supportsAllDrives: true, includeItemsFromAllDrives: true };
    if (folder.driveId) { opciones.corpora = 'drive'; opciones.driveId = folder.driveId; }
    if (pagina) opciones.pageToken = pagina;
    const respuesta = Drive.Files.list(opciones);
    if (respuesta.incompleteSearch) throw new Error('Drive devolvió una búsqueda incompleta. Vuelva a leer la carpeta.');
    return { carpeta: id, archivos: respuesta.files || [], siguiente: respuesta.nextPageToken || '' };
}

function consultarEstadoRecepcionMasiva(datos) {
    exigirAdministradorRecepcion_();
    const p = resolverPeriodo_(datos.mes, datos.anio);
    if (!Array.isArray(datos.ruts) || datos.ruts.length > 2000 || datos.ruts.some(r => !rutRecepcionValido_(r))) {
        throw new Error('Consulte hasta 2.000 RUT válidos por listado.');
    }
    const buscados = new Set(datos.ruts.map(normalizarRutCanonical_));
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET), sheet = ss.getSheetByName(CONFIG.TAB_LOG);
    const filas = sheet && sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues() : [];
    const resultado = {};
    filas.forEach(row => {
        const rut = normalizarRutCanonical_(row[3]);
        if (buscados.has(rut) && String(row[1]).trim().toUpperCase() === p.mes && Number(row[2]) === p.anio) {
            resultado[rut] = { estado: String(row[5]), finalizado: String(row[5]).includes('FINALIZADO'),
                remu: urlDriveValida_(row[7]) ? row[7] : '', transp: urlDriveValida_(row[8]) ? row[8] : '' };
        }
    });
    return resultado;
}

function leerPdfRecepcion_(archivo) {
    if (!archivo || typeof archivo !== 'object') throw new Error('Falta un PDF.');
    if (archivo.origen === 'local') return validarAdjunto_(archivo.base64, 'application/pdf');
    if (archivo.origen !== 'drive' || !/^[A-Za-z0-9_-]{10,150}$/.test(String(archivo.id || ''))) throw new Error('Origen del PDF inválido.');
    const opciones = { fields: 'id,name,size,mimeType,trashed,version', supportsAllDrives: true };
    const antes = Drive.Files.get(archivo.id, opciones);
    if (antes.trashed || antes.mimeType !== 'application/pdf' || !Number(antes.size) || Number(antes.size) > 5 * 1024 * 1024) {
        throw new Error('El PDF de Drive debe estar disponible y pesar hasta 5 MB.');
    }
    if (!archivo.version || String(antes.version) !== String(archivo.version)) throw new Error('El PDF de Drive cambió. Vuelva a leer la carpeta y revise el par.');
    const bytes = DriveApp.getFileById(archivo.id).getBlob().getBytes();
    const despues = Drive.Files.get(archivo.id, opciones);
    if (String(despues.version) !== String(antes.version) || despues.trashed) throw new Error('El PDF cambió durante la lectura. Vuelva a revisar el par.');
    return validarAdjunto_(Utilities.base64Encode(bytes), 'application/pdf');
}

/** Un par por llamada. Reutiliza reservas, hashes e IDs persistentes del flujo dual. */
function registrarParRecepcionMasiva(datos) {
    const autor = exigirAdministradorRecepcion_();
    if (!datos || datos.revisado !== true || !rutRecepcionValido_(datos.rut)) throw new Error('Revise la identidad y ambas versiones antes de registrar.');
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(datos.loteId || ''))) throw new Error('Identificador de lote inválido.');
    const p = resolverPeriodo_(datos.mes, datos.anio);
    comprobarCupoInformes_('subida');
    if (datos.remu && datos.transp && datos.remu.origen === 'drive' && datos.transp.origen === 'drive' && datos.remu.id === datos.transp.id) {
        throw new Error('Remuneraciones y transparencia deben ser archivos distintos.');
    }
    const remu = leerPdfRecepcion_(datos.remu), transp = leerPdfRecepcion_(datos.transp);
    const hash = bytes => Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
    if (hash(remu) === hash(transp)) throw new Error('Los dos PDF tienen el mismo contenido. Revise la versión de transparencia.');
    const auditoria = { loteId: datos.loteId, autor: autor, fecha: new Date().toISOString(),
        origenRemu: datos.remu.origen, origenTransp: datos.transp.origen };
    const resultado = guardarAdjuntosInforme_({ rut: normalizarRutCanonical_(datos.rut), mes: p.mes, anio: p.anio }, [
        { tipo: 'remu', bytes: remu, mime: 'application/pdf' },
        { tipo: 'transp', bytes: transp, mime: 'application/pdf' }
    ], auditoria);
    return { exito: true, recuperado: !!resultado.recuperado, rut: normalizarRutCanonical_(datos.rut),
        loteId: datos.loteId, remu: resultado.urlRemu, transp: resultado.urlTransp };
}

/** Una repetición de un periodo cerrado solo se acepta si coincide con los dos hashes. */
function recuperarEntregaRecepcion_(datos, adjuntos) {
    return conBloqueoInformes_(function() {
        const p = resolverPeriodo_(datos.mes, datos.anio);
        const fila = buscarFilaInforme_(hojaInformes_(), datos.rut, p.mes, p.anio);
        const control = leerControl_(fila), archivos = control.archivos || {};
        if (!fila || !String(fila.valores[5]).includes('FINALIZADO') || !control.recepcionMasiva ||
            adjuntos.some(a => archivos['adjunto_' + a.tipo + '_hash'] !==
                Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a.bytes)))) {
            throw new Error('Este periodo ya está finalizado con otra entrega. No se reemplazó ningún archivo.');
        }
        return { exito: true, recuperado: true, urlRemu: fila.valores[7], urlTransp: fila.valores[8] };
    });
}
