/** Generación única para informes individuales y lotes. */
function procesarInforme(datos) {
    validarDatosInforme_(datos);
    asegurarConexionCloud_();
    comprobarCupoInformes_('generacion');
    const p = resolverPeriodo_(datos.mesSeleccionado, datos.anio);
    datos = Object.assign({}, datos, { rut: normalizarRutCanonical_(datos.rut), anio: p.anio });
    const fechas = obtenerRangoFechas_(p.mes, p.anio);
    // Conservar periodos editados, siempre que sean válidos y estén dentro del mes.
    datos.fechaInicioMes = validarFechaPeriodo_(datos.fechaInicioMes || fechas.inicio, p);
    datos.fechaFinMes = validarFechaPeriodo_(datos.fechaFinMes || fechas.fin, p);
    if (fechaComparable_(datos.fechaInicioMes) > fechaComparable_(datos.fechaFinMes)) {
        throw new Error('El inicio del periodo debe ser anterior a su término.');
    }
    const meta = obtenerMetadataSegura_(datos.rut);
    if (!meta.encontrado) throw new Error('El funcionario no pertenece a la dotación vigente.');
    datos.nombre = meta.nombre;
    datos.nacimiento = meta.nacimiento;
    datos.funcion = String(meta.funcion || '').trim();
    datos.funcionHtml = '';
    if (!datos.funcion) throw new Error('La función de contrato está vacía en la nómina. Solicite su revisión con Alertar error.');
    const op = reservarOperacion_(datos, 'generacion');
    if (op.encolado) return respuestaCola_(op.control);
    if (op.finalizado || op.recuperado) {
        return { exito: true, urlRemu: op.previo.linkRemu, urlTransp: op.previo.linkTransp,
            urlDocs: urlDriveValida_(op.previo.linkDocs) ? op.previo.linkDocs : '', bloqueoTotal: !!op.finalizado, recuperado: true,
            mensajeBloqueo: op.finalizado ? 'El mes ya fue finalizado.' : '' };
    }
    try {
        if (!PropertiesService.getScriptProperties().getProperty('CLOUD_RUN_API_KEY')) {
            throw new Error('CONFIGURACION: Falta CLOUD_RUN_API_KEY en las propiedades del script.');
        }
        // La identidad y la jerarquía proceden de la nómina, no del nombre enviado por el navegador.
        const ids = op.control.archivos;
        // Fijar el motor por operación evita mezclar temporales antiguos y generación HTML.
        const motor = ids.motorPDF || (ids.docRemu || ids.docTransp ? 'DOCS' :
            (PropertiesService.getScriptProperties().getProperty('CLOUD_PDF_MOTOR') || CONFIG.CLOUD_PDF_MOTOR) === 'HTML' ? 'HTML' : 'DOCS');
        ids.motorPDF = motor;
        const html = motor === 'HTML';
        const carpetas = crearEstructuraCarpetas_(datos, meta, p.mes, p.anio, html ? ['generados', 'transp'] : ['docs', 'generados', 'transp']);
        if (html && !ids.cloudPendiente && !ids.cloudRespuestaConfirmada &&
            PropertiesService.getScriptProperties().getProperty('COLA_PDF_ACTIVA') === 'true') {
            return encolarPDF_(op, datos, p, carpetas);
        }
        const firma = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy');
        if (!html && !ids.docRemu) {
            ids.docRemu = obtenerCopiaOperacion_(carpetas.docs, op.control.id, 'REMU');
            guardarPuntoControl_(op, 'DOCUMENTO REMUNERACIONES');
        }
        if (!html && !ids.remuLlenado) {
            const doc = DocumentApp.openById(ids.docRemu);
            llenarDocumentoInforme_(doc, datos, p, firma, true);
            ids.remuLlenado = true;
            guardarPuntoControl_(op, 'REMUNERACIONES COMPLETO');
        }
        if (!html && !ids.docTransp) {
            ids.docTransp = obtenerCopiaOperacion_(carpetas.docs, op.control.id, 'TRANSPARENCIA');
            guardarPuntoControl_(op, 'DOCUMENTO TRANSPARENCIA');
        }
        if (!html && !ids.transpLlenado) {
            const doc = DocumentApp.openById(ids.docTransp);
            llenarDocumentoInforme_(doc, datos, p, firma, false);
            ids.transpLlenado = true;
            guardarPuntoControl_(op, 'TRANSPARENCIA COMPLETO');
        }
        if ((!ids.urlRemu || !ids.urlTransp) && ids.cloudRespuestaConfirmada && !html) {
            // El HTTP ya respondió; recuperar solo la escritura local sin volver a llamar al servicio.
            ids.urlRemu = recuperarPdfLocal_(ids.pdfRemu, ids.docRemu, carpetas.generados.getId(), datos.nombre + '.pdf');
            guardarPuntoControl_(op, 'PDF REMUNERACIONES RECUPERADO');
            ids.urlTransp = recuperarPdfLocal_(ids.pdfTransp, ids.docTransp, carpetas.transp.getId(), datos.nombre + '.pdf');
            ids.cloudPendiente = false;
            guardarPuntoControl_(op, 'PDF TRANSPARENCIA RECUPERADO');
        }
        if (!ids.urlRemu || !ids.urlTransp) {
            if (html && ids.cloudRespuestaConfirmada) ids.cloudPendiente = false;
            if (ids.cloudPendiente) {
                throw new Error('RECUPERACION_CLOUD: La llamada anterior no tuvo respuesta confirmada. Soporte debe revisar el servicio antes de repetirla.');
            }
            // Se registra ANTES del HTTP: una respuesta perdida nunca dispara otra exportación ciega.
            ids.cloudPendiente = true;
            ids.cloudAutenticacionRechazada = false;
            ids.folderRemu = carpetas.generados.getId();
            ids.folderTransp = carpetas.transp.getId();
            guardarPuntoControl_(op, 'EXPORTANDO PDF');
            const resultado = llamarCloudPDF_(ids.docRemu, ids.docTransp, carpetas.generados.getId(),
                carpetas.transp.getId(), datos.nombre + '.pdf', op.control.id, html ? {
                    motor: 'HTML', remuneraciones: datosPlantillaCloud_(datos, p, true),
                    transparencia: datosPlantillaCloud_(datos, p, false)
                } : null);
            // Si la API entrega enlaces, ya guardó los PDF. Si entrega bytes, los guardamos una vez.
            if (urlDriveValida_(resultado.urlRemu) && urlDriveValida_(resultado.urlTransp)) {
                ids.urlRemu = resultado.urlRemu; ids.urlTransp = resultado.urlTransp;
                ids.cloudPendiente = false;
                guardarPuntoControl_(op, 'PDF GUARDADOS POR CLOUD');
            } else if (resultado.pdfRemuBase64 && resultado.pdfTranspBase64) {
                let idsNuevos = false;
                // Crear IDs binarios persistentes permite recuperar una escritura de Drive incierta.
                if (!ids.pdfRemu || !ids.pdfTransp) {
                    const nuevos = Drive.Files.generateIds({ count: 2, space: 'drive', type: 'files' }).ids;
                    ids.pdfRemu = nuevos[0]; ids.pdfTransp = nuevos[1];
                    idsNuevos = true;
                    ids.cloudRespuestaConfirmada = true;
                    guardarPuntoControl_(op, 'IDS PDF RESERVADOS');
                }
                ids.urlRemu = guardarPdfConId_(ids.pdfRemu, resultado.pdfRemuBase64, carpetas.generados.getId(), datos.nombre + '.pdf', idsNuevos);
                guardarPuntoControl_(op, 'PDF REMUNERACIONES GUARDADO');
                ids.urlTransp = guardarPdfConId_(ids.pdfTransp, resultado.pdfTranspBase64, carpetas.transp.getId(), datos.nombre + '.pdf', idsNuevos);
                ids.cloudPendiente = false;
                guardarPuntoControl_(op, 'PDF TRANSPARENCIA GUARDADO');
            } else {
                throw new Error('El servicio PDF respondió sin los dos archivos requeridos.');
            }
        }
        const registro = datosParaRegistro_(datos, p);
        Object.assign(registro, { estado: 'GENERADO (PENDIENTE FIRMA)', linkDocs: 'TEMPORALES ELIMINADOS',
            linkRemu: ids.urlRemu, linkTransp: ids.urlTransp });
        terminarOperacion_(op, registro);
        // La limpieza nunca convierte una generación confirmada en un error para el usuario.
        [ids.docRemu, ids.docTransp].filter(Boolean).forEach(function(id) {
            try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { console.warn('Pendiente limpieza de temporal: ' + id); }
        });
        return { exito: true, urlRemu: ids.urlRemu, urlTransp: ids.urlTransp, urlDocs: '' };
    } catch (e) {
        if (e.cloudSinEjecucion && op.control.archivos) op.control.archivos.cloudPendiente = false;
        if (e.cloudHTTP === 401 && op.control.archivos) op.control.archivos.cloudAutenticacionRechazada = true;
        registrarPausaCuota_(e, 'generacion');
        try { terminarOperacion_(op, null, e); } catch (registroError) { console.error('No se pudo registrar el fallo de la operación.'); }
        throw e;
    }
}

function recuperarPdfLocal_(pdfId, docId, folderId, nombre) {
    try {
        const existente = Drive.Files.get(pdfId, { fields: 'id,trashed', supportsAllDrives: true });
        if (existente.trashed) throw new Error('El PDF fue eliminado. Contacte a soporte.');
        return 'https://drive.google.com/file/d/' + pdfId + '/view';
    } catch (e) { if (!/404|not found/i.test(String(e))) throw e; }
    // Solo para recuperación después de una respuesta Cloud confirmada; consume cuota de conversión.
    const blob = DriveApp.getFileById(docId).getAs('application/pdf');
    Drive.Files.create({ id: pdfId, name: nombre, mimeType: 'application/pdf', parents: [folderId] },
        blob, { fields: 'id', supportsAllDrives: true });
    return 'https://drive.google.com/file/d/' + pdfId + '/view';
}

function obtenerCopiaOperacion_(folder, id, tipo) {
    const nombre = 'TEMP_' + id + '_' + tipo;
    const existentes = folder.getFilesByName(nombre);
    if (existentes.hasNext()) return existentes.next().getId();
    return DriveApp.getFileById(CONFIG.ID_PLANTILLA).makeCopy(nombre, folder).getId();
}

function llenarDocumentoInforme_(doc, datos, p, firma, privado) {
    const secciones = [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(Boolean);
    secciones.forEach(function(body) {
        llenarPlantilla_(body, datos, p.mes, p.anio, firma, privado);
        if (!privado) censurarDatos_(body, variantesSensibles_(datos));
    });
    doc.saveAndClose();
}

function guardarPdfConId_(id, base64, folderId, nombre, idNuevo) {
    if (!idNuevo) try {
        const existente = Drive.Files.get(id, { fields: 'id,webViewLink,trashed', supportsAllDrives: true });
        if (existente.trashed) throw new Error('El archivo de esta operación fue eliminado. Contacte a soporte.');
        return existente.webViewLink || 'https://drive.google.com/file/d/' + id + '/view';
    } catch (e) {
        if (!/404|not found|File not found/i.test(String(e))) throw e;
    }
    const bytes = Utilities.base64Decode(base64);
    const magic = bytes.slice(0, 5).map(function(b) { return String.fromCharCode((b + 256) % 256); }).join('');
    if (magic !== '%PDF-') throw new Error('El servicio no entregó un PDF válido.');
    Drive.Files.create({ id: id, name: nombre, mimeType: 'application/pdf', parents: [folderId] },
        Utilities.newBlob(bytes, 'application/pdf', nombre), { fields: 'id', supportsAllDrives: true });
    return 'https://drive.google.com/file/d/' + id + '/view';
}

function verificarExistenciaRapida_(rut, mes, anio, ss) {
    const spreadsheet = ss || SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    const sheet = spreadsheet.getSheetByName(CONFIG.TAB_LOG);
    return sheet ? registroDesdeFila_(buscarFilaInforme_(sheet, rut, String(mes).trim().toUpperCase(), anio)) : { existe: false };
}

function registrarEnLog_(data) {
    try { return conBloqueoInformes_(function() { return registrarEnLogSinBloqueo_(data); }); }
    catch (e) { return { exito: false, error: e.message }; }
}

function guardarArchivoFirmado(datos) {
    comprobarCupoInformes_('subida');
    const bytes = validarAdjunto_(datos.bytes, datos.mimeType);
    return guardarAdjuntosInforme_(datos, [{ tipo: 'firmado', bytes: bytes, mime: datos.mimeType }]);
}

function guardarArchivosDual(payload) {
    comprobarCupoInformes_('subida');
    const transp = validarAdjunto_(payload.rawTransp, payload.mimeTransp);
    const remu = validarAdjunto_(payload.rawBoleta, payload.mimeBoleta);
    return guardarAdjuntosInforme_(payload, [{ tipo: 'transp', bytes: transp, mime: payload.mimeTransp },
        { tipo: 'remu', bytes: remu, mime: payload.mimeBoleta }]);
}

function guardarArchivoDualLote(payload) {
    comprobarCupoInformes_('subida');
    if (payload.tipo !== 'transp' && payload.tipo !== 'remu') throw new Error('Tipo de adjunto inválido.');
    const bytes = validarAdjunto_(payload.bytes, payload.mimeType);
    return guardarAdjuntosInforme_(payload, [{ tipo: payload.tipo, bytes: bytes, mime: payload.mimeType }]);
}

function guardarAdjuntosInforme_(datos, adjuntos, recepcionMasiva) {
    const meta = obtenerMetadataSegura_(datos.rut);
    if (!meta.encontrado) throw new Error('El funcionario no pertenece a la dotación vigente.');
    datos = Object.assign({}, datos, { nombre: meta.nombre });
    const op = reservarOperacion_(datos, 'subida');
    if (op.finalizado) return recepcionMasiva ? recuperarEntregaRecepcion_(datos, adjuntos) :
        { exito: true, recuperado: true, url: op.previo.linkRespaldo };
    try {
        const extra = Object.assign({}, datos.datosExtra || {}, { rut: op.rut, nombre: meta.nombre });
        const destinos = adjuntos.some(a => a.tipo === 'transp') ? ['remu', 'transp'] : ['remu'];
        const carpetas = crearEstructuraCarpetas_(extra, meta, op.periodo.mes, op.periodo.anio, destinos);
        if (adjuntos[0].tipo === 'firmado' && (!urlDriveValida_(op.previo.linkRemu) || !urlDriveValida_(op.previo.linkTransp))) {
            throw new Error('Debe generar los dos informes antes de finalizar.');
        }
        const registro = datosParaRegistro_(extra, op.periodo);
        registro.linkRemu = op.previo.linkRemu; registro.linkTransp = op.previo.linkTransp;
        registro.linkRespaldo = op.previo.linkRespaldo;
        let ultimaUrl;
        const ids = op.control.archivos;
        const pendientes = [];
        // Validar los hashes de todos los adjuntos antes de guardar cualquiera.
        adjuntos.forEach(function(adjunto) {
            const clave = 'adjunto_' + adjunto.tipo;
            const hash = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, adjunto.bytes));
            if (ids[clave + '_hash'] && ids[clave + '_hash'] !== hash) {
                throw new Error('Ya existe otro archivo para esta carga. Soporte debe revisar su reemplazo.');
            }
            if (!ids[clave]) pendientes.push({clave: clave, hash: hash});
        });
        if (recepcionMasiva) {
            op.control.recepcionMasiva = op.control.recepcionMasiva || recepcionMasiva;
            guardarPuntoControl_(op, 'RECEPCION MASIVA REVISADA');
        }
        if (pendientes.length) {
            const nuevos = Drive.Files.generateIds({count: pendientes.length, space: 'drive', type: 'files'}).ids;
            pendientes.forEach((item, i) => { ids[item.clave] = nuevos[i]; ids[item.clave + '_hash'] = item.hash; });
            guardarPuntoControl_(op, 'ADJUNTOS RESERVADOS');
        }
        adjuntos.forEach(function(adjunto) {
            const claveId = 'adjunto_' + adjunto.tipo;
            const extension = adjunto.mime === 'application/pdf' ? 'pdf' : adjunto.mime === 'image/png' ? 'png' : 'jpg';
            const folder = adjunto.tipo === 'transp' ? carpetas.transp : carpetas.remu;
            const id = ids[claveId];
            let existe = false;
            if (!pendientes.some(item => item.clave === claveId)) try {
                const archivo = Drive.Files.get(id, { fields: 'id,trashed', supportsAllDrives: true });
                if (archivo.trashed) throw new Error('El adjunto fue eliminado. Contacte a soporte.');
                existe = true;
            } catch (e) { if (!/404|not found/i.test(String(e))) throw e; }
            if (!existe) Drive.Files.create({ id: id, name: meta.nombre + '_' + adjunto.tipo + '.' + extension,
                mimeType: adjunto.mime, parents: [folder.getId()] },
                Utilities.newBlob(adjunto.bytes, adjunto.mime), { fields: 'id', supportsAllDrives: true });
            ultimaUrl = 'https://drive.google.com/file/d/' + id + '/view';
            if (adjunto.tipo === 'transp') registro.linkTransp = ultimaUrl;
            else {
                registro.linkRespaldo = ultimaUrl;
                if (adjunto.tipo === 'remu') registro.linkRemu = ultimaUrl;
            }
            guardarPuntoControl_(op, 'ADJUNTO GUARDADO');
        });
        const completo = urlDriveValida_(registro.linkTransp) && urlDriveValida_(registro.linkRespaldo);
        registro.estado = completo ? 'FINALIZADO (OK)' : 'PROCESO DUAL';
        terminarOperacion_(op, registro);
        return { exito: true, url: ultimaUrl, urlRemu: registro.linkRemu, urlTransp: registro.linkTransp };
    } catch (e) {
        registrarPausaCuota_(e, 'subida');
        try { terminarOperacion_(op, null, e); } catch (registroError) { console.error('No se pudo registrar el fallo de la carga.'); }
        throw e;
    }
}

/** Sin reintentos HTTP: el servidor actual no tiene contrato de idempotencia confirmado. */
function llamarCloudPDF_(docIdRemu, docIdTransp, folderIdRemu, folderIdTransp, nombrePdf, operationId, documentosHTML) {
    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty('CLOUD_RUN_API_KEY');
    const url = props.getProperty('CLOUD_RUN_URL') || CONFIG.CLOUD_RUN_URL;
    if (!apiKey) throw new Error('CONFIGURACION: Falta CLOUD_RUN_API_KEY en las propiedades del script.');
    if (!/^https:\/\/[a-z0-9.-]+\.run\.app\//i.test(url)) throw new Error('La URL Cloud Run configurada no es válida.');
    const respuesta = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json',
        headers: { 'x-api-key': apiKey, 'Idempotency-Key': operationId },
        payload: JSON.stringify({ docIdRemu: docIdRemu, docIdTransp: docIdTransp,
            folderIdRemu: folderIdRemu, folderIdTransp: folderIdTransp, nombrePdf: nombrePdf, operationId: operationId, documentosHTML: documentosHTML || undefined }),
        muteHttpExceptions: true });
    const code = respuesta.getResponseCode();
    if (code !== 200) {
        const error = new Error(code === 429 ? 'OCUPADO: El generador PDF está atendiendo otra solicitud. Su informe se conserva.' :
            code === 401 ? 'CONFIGURACION_CLOUD: Cloud rechazó la clave de conexión del script. No es un límite de usuarios. Conserve su informe y solicite revisar la conexión.' :
            'CLOUD_HTTP_' + code + ': El servicio PDF no confirmó la generación. Contacte a soporte.');
        // La API autenticada rechaza estos estados antes de comenzar a generar/guardar archivos.
        error.cloudSinEjecucion = [401,413,429].indexOf(code) >= 0;
        error.cloudHTTP = code;
        throw error;
    }
    let resultado;
    try { resultado = JSON.parse(respuesta.getContentText()); }
    catch (e) { throw new Error('El servicio PDF respondió con un formato inválido.'); }
    if (!resultado.exito) throw new Error('El servicio PDF no confirmó los archivos. Contacte a soporte.');
    return resultado;
}

function enviarReporteProblema(datos) {
    if (!datos || !String(datos.mensaje || '').trim() || String(datos.mensaje).length > 4000) {
        return { exito: false, error: 'Describa el problema en un máximo de 4000 caracteres.' };
    }
    try {
        MailApp.sendEmail('renato.alvarez@municoquimbo.cl', '[SOPORTE HONORARIOS] Reporte de ' + String(datos.nombre || '').substring(0, 120),
            'Funcionario: ' + datos.nombre + '\nRUT: ' + datos.rut + '\nMensaje: ' + datos.mensaje +
            '\nCorreo: ' + (datos.correo || '') + '\nFono: ' + (datos.fono || ''));
        return { exito: true };
    } catch (e) { return { exito: false, error: 'No fue posible enviar el reporte.' }; }
}
