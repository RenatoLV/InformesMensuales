/**
 * Puente de cola. Sheets conserva la exclusión mensual; Cloud Tasks ejecuta.
 * El navegador nunca recibe la clave Cloud ni el contenido del outbox.
 */
function respuestaCola_(control) {
    if (control.cola.error) return {exito:false, error:control.cola.error};
    return {exito:true, encolado:true, ticket:control.cola.ticket,
        mensaje:'Solicitud guardada. Los PDF se procesarán por turnos.'};
}

function cloudCola_(ruta, payload) {
    const props = PropertiesService.getScriptProperties();
    const base = props.getProperty('COLA_PDF_URL');
    const key = props.getProperty('CLOUD_RUN_API_KEY');
    if (!/^https:\/\/[a-z0-9-]+[.]a[.]run[.]app$|^https:\/\/[a-z0-9-]+[.][a-z0-9-]+[.]run[.]app$/i.test(base || '') || !key) {
        throw new Error('CONFIGURACION: Revise COLA_PDF_URL y CLOUD_RUN_API_KEY.');
    }
    const response = UrlFetchApp.fetch(base + ruta, {method:'post', contentType:'application/json',
        headers:{'x-api-key':key}, payload:JSON.stringify(payload), muteHttpExceptions:true});
    if (response.getResponseCode() !== 200) throw new Error('COLA_HTTP_' + response.getResponseCode() + ': No se confirmó la operación.');
    return JSON.parse(response.getContentText());
}

function cacheEstadoCola_(control, respuesta) {
    try { CacheService.getScriptCache().put('COLA_ESTADO_' + control.cola.ticket, JSON.stringify(respuesta), 21600); }
    catch(e) { console.warn('Estado de cola pendiente de caché.'); }
}

function encolarPDF_(op, datos, periodo, carpetas) {
    const props = PropertiesService.getScriptProperties();
    const outbox = props.getProperty('COLA_PDF_OUTBOX_FOLDER_ID');
    if (!outbox || !props.getProperty('COLA_PDF_URL')) throw new Error('CONFIGURACION: Falta preparar el almacenamiento privado de la cola.');
    const ids = op.control.archivos;
    if (!op.control.cola) {
        const nuevos = Drive.Files.generateIds({count:3, space:'drive', type:'files'}).ids;
        ids.pdfRemu = ids.pdfRemu || nuevos[0]; ids.pdfTransp = ids.pdfTransp || nuevos[1];
        ids.folderRemu = carpetas.generados.getId(); ids.folderTransp = carpetas.transp.getId();
        op.control.cola = {ticket:Utilities.getUuid(), payloadId:nuevos[2], nombrePDF:datos.nombre + '.pdf', pendiente:false, creado:Date.now()};
        guardarPuntoControl_(op, 'PREPARANDO COLA');
    }
    const c = op.control.cola;
    let payload = {documentosHTML:{motor:'HTML', remuneraciones:datosPlantillaCloud_(datos,periodo,true),
        transparencia:datosPlantillaCloud_(datos,periodo,false)}};
    const texto = JSON.stringify(payload);
    // ID fijo: un corte después de crear el archivo se recupera sin duplicarlo.
    let existente = false;
    try {
        const file = Drive.Files.get(c.payloadId, {fields:'id,trashed', supportsAllDrives:true});
        if (file.trashed) throw new Error('El archivo de recuperación fue eliminado.');
        existente = true;
    } catch(e) { if (!/404|not found/i.test(String(e))) throw e; }
    if (!existente) Drive.Files.create({id:c.payloadId, name:'cola-' + op.control.id + '.json',
        mimeType:'application/json', parents:[outbox]}, Utilities.newBlob(texto, 'application/json'),
        {fields:'id', supportsAllDrives:true});
    else payload = JSON.parse(DriveApp.getFileById(c.payloadId).getBlob().getDataAsString());
    // Este punto es la aceptación durable, anterior a cualquier HTTP.
    c.pendiente = true;
    liberarReservaCola_(op);
    const respuesta = respuestaCola_(op.control);
    cacheEstadoCola_(op.control, respuesta);
    try { cloudCola_('/cola', {operationId:op.control.id, payload:payload}); }
    catch(e) { console.warn('Outbox PDF pendiente de envío; el reconciliador reintentará.'); }
    return respuesta;
}

function liberarReservaCola_(op) {
    conBloqueoInformes_(function() {
        const props = PropertiesService.getScriptProperties();
        const activos = JSON.parse(props.getProperty('INFORMES_ACTIVOS') || '{}');
        if (!activos[op.clave] || activos[op.clave].lease !== op.lease) throw new Error('La reserva cambió.');
        op.control.fase = 'EN COLA';
        agregarEventoOperacion_(op.control, 'EN COLA');
        registrarEnLogSinBloqueo_({rut:op.rut, mes:op.periodo.mes, anio:op.periodo.anio, estado:'EN COLA'}, op.control);
        props.setProperty('COLA_HAY_PENDIENTES', 'true');
        delete activos[op.clave];
        props.setProperty('INFORMES_ACTIVOS', JSON.stringify(activos));
    });
}

function consultarGeneracionPDF(ticket) {
    if (typeof ticket !== 'string' || !/^[a-f0-9-]{36}$/i.test(ticket)) throw new Error('Comprobante inválido.');
    const cache = CacheService.getScriptCache();
    const previo = cache.get('COLA_ESTADO_' + ticket);
    if (previo) return JSON.parse(previo);
    // Solo en ausencia de caché: no consulta la nómina ni invoca Chromium/Cloud.
    const sheet = hojaInformes_();
    if (sheet.getLastRow() > 1) {
        const encontrados = sheet.getRange(2,23,sheet.getLastRow()-1,1).createTextFinder('"ticket":"' + ticket + '"').findAll();
        for (let i=0; i<encontrados.length; i++) {
            let control;
            try { control = JSON.parse(sheet.getRange(encontrados[i].getRow(),23).getValue()); } catch(e) { continue; }
            if (!control.cola || control.cola.ticket !== ticket) continue;
            const respuesta = estadoControlCola_(control);
            cacheEstadoCola_(control,respuesta);
            return respuesta;
        }
    }
    throw new Error('No se encontró el comprobante. Conserve su borrador y contacte a soporte.');
}

function consultarGeneracionesPDF(tickets) {
    if (!Array.isArray(tickets) || tickets.length > 50) throw new Error('Consulte hasta 50 comprobantes.');
    return tickets.map(function(ticket) {
        try { return {ticket:ticket, resultado:consultarGeneracionPDF(ticket)}; }
        catch(e) { return {ticket:ticket, resultado:{exito:false,error:e.message}}; }
    });
}

function estadoControlCola_(control) {
    if (control.cola.error) return {exito:false, error:control.cola.error};
    if (control.cola.pendiente) return respuestaCola_(control);
    const a = control.archivos || {};
    return {exito:true, urlRemu:a.urlRemu, urlTransp:a.urlTransp, urlDocs:''};
}

// Instalar UNA vez desde el editor con la cuenta propietaria. No se expone por RPC.
function instalarReconciliadorPDF_() {
    const existentes = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'reconciliarColaPDF_');
    if (!existentes.length) ScriptApp.newTrigger('reconciliarColaPDF_').timeBased().everyMinutes(1).create();
}

function activarColaPDF_() {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('COLA_PDF_OUTBOX_FOLDER_ID');
    const folder = Drive.Files.get(id,{fields:'id,mimeType,trashed',supportsAllDrives:true});
    if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder') throw new Error('Outbox inválido.');
    cloudCola_('/cola/estados',{ids:[]});
    instalarReconciliadorPDF_();
    props.setProperty('COLA_PDF_ACTIVA','true');
    // También permite recuperar trabajo aceptado antes de una interrupción.
    props.setProperty('COLA_HAY_PENDIENTES','true');
}

function reconciliarColaPDF_() {
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty('COLA_PDF_URL') || props.getProperty('COLA_HAY_PENDIENTES') !== 'true') return;
    const owner = Utilities.getUuid();
    const tomado = conBloqueoInformes_(function() {
        const previo = JSON.parse(props.getProperty('COLA_RECONCILIADOR') || '{}');
        if (previo.vence > Date.now()) return false;
        props.setProperty('COLA_RECONCILIADOR', JSON.stringify({owner:owner, vence:Date.now()+300000}));
        return true;
    });
    if (!tomado) return;
    const inicio = Date.now();
    try {
        const sheet = hojaInformes_();
        if (sheet.getLastRow() < 2) return;
        // Una lectura de controles por ciclo, no una lectura por usuario consultando.
        const pendientes = sheet.getRange(2,23,sheet.getLastRow()-1,1).getValues().flatMap(function(row) {
            try {
                const c = JSON.parse(row[0]);
                return c.cola && c.cola.pendiente && !c.cola.error ? [c] : [];
            } catch(e) { return []; }
        });
        // Cursor circular: un error/pendiente temprano nunca deja sin atención el resto.
        const cursor = Number(props.getProperty('COLA_CURSOR') || 0) % Math.max(1,pendientes.length);
        const lote = pendientes.slice(cursor).concat(pendientes.slice(0,cursor)).slice(0,50);
        if (!lote.length) {
            conBloqueoInformes_(function() {
                // Una nueva aceptación puede haber ocurrido después de la lectura.
                const valores = sheet.getRange(2,23,sheet.getLastRow()-1,1).getValues();
                const hay = valores.some(function(row) {
                    try { const c=JSON.parse(row[0]); return c.cola && c.cola.pendiente && !c.cola.error; } catch(e) { return false; }
                });
                if (!hay) props.setProperty('COLA_HAY_PENDIENTES','false');
            });
            return;
        }
        const estados = cloudCola_('/cola/estados', {ids:lote.map(c => c.id), reparar:true});
        for (let i=0;i<lote.length && Date.now()-inicio < 210000;i++) {
            const control = lote[i], estado = estados.find(e => e.id === control.id);
            try {
                if (!estado) continue;
                if (estado.estado === 'NO_EXISTE') {
                    if (Date.now() - control.cola.creado > 86400000) {
                        registrarErrorCola_(control, 'La solicitud no pudo enviarse en 24 horas. Requiere revisión.');
                    } else {
                        const payload = JSON.parse(DriveApp.getFileById(control.cola.payloadId).getBlob().getDataAsString());
                        cloudCola_('/cola', {operationId:control.id, payload:payload});
                    }
                } else if (estado.estado === 'LISTO') {
                    finalizarColaPDF_(control, cloudCola_('/cola/resultado', {id:control.id}));
                } else if (estado.estado === 'ERROR') {
                    registrarErrorCola_(control, estado.error || 'La generación requiere revisión.');
                }
            } catch(e) {
                if (/COLA_HTTP_410/.test(String(e))) registrarErrorCola_(control,'Venció la copia temporal del PDF. Requiere revisión.');
                else console.warn('Un informe sigue pendiente de reconciliación.');
            }
            props.setProperty('COLA_CURSOR', String(cursor + i + 1));
        }
    } finally {
        conBloqueoInformes_(function() {
            const actual = JSON.parse(props.getProperty('COLA_RECONCILIADOR') || '{}');
            if (actual.owner === owner) props.setProperty('COLA_RECONCILIADOR','{}');
        });
    }
}

function filaCola_(sheet, id) {
    const found = sheet.getRange(2,23,sheet.getLastRow()-1,1).createTextFinder('"id":"' + id + '"').findAll();
    if (found.length !== 1) throw new Error('Control de cola ausente o duplicado.');
    const row = found[0].getRow(), valores = sheet.getRange(row,1,1,23).getValues()[0];
    return {row:row, valores:valores};
}

function registrarErrorCola_(control, mensaje) {
    conBloqueoInformes_(function() {
        const sheet = hojaInformes_(), fila = filaCola_(sheet,control.id), actual = leerControl_(fila);
        if (!actual.cola.pendiente) return;
        actual.cola.error = mensaje; actual.fase = 'COLA REQUIERE REVISION';
        // Se conserva pendiente: no permite una carga/generación rival.
        sheet.getRange(fila.row,23).setValue(JSON.stringify(actual));
        sheet.getRange(fila.row,6).setValue('COLA REQUIERE REVISION');
        cacheEstadoCola_(actual,estadoControlCola_(actual));
    });
}

function finalizarColaPDF_(control, resultado) {
    const a = control.archivos;
    if (!resultado.pdfRemuBase64 || !resultado.pdfTranspBase64) throw new Error('Falta uno de los PDF.');
    // Las subidas quedan fuera del candado. IDs preasignados resuelven respuestas perdidas.
    const remu = guardarPdfConId_(a.pdfRemu,resultado.pdfRemuBase64,a.folderRemu,control.cola.nombrePDF || 'Informe remuneraciones.pdf',false);
    const transp = guardarPdfConId_(a.pdfTransp,resultado.pdfTranspBase64,a.folderTransp,control.cola.nombrePDF || 'Informe transparencia.pdf',false);
    let completado;
    conBloqueoInformes_(function() {
        const sheet = hojaInformes_(), fila = filaCola_(sheet,control.id), actual = leerControl_(fila);
        if (!actual.cola.pendiente || actual.cola.ticket !== control.cola.ticket) return;
        if (String(fila.valores[5]).indexOf('FINALIZADO') >= 0) throw new Error('Periodo finalizado; requiere revisión.');
        actual.archivos.urlRemu = remu; actual.archivos.urlTransp = transp;
        actual.cola.pendiente = false; actual.cola.error = '';
        actual.fase = 'COMPLETADO'; agregarEventoOperacion_(actual,'PDF COLA GUARDADOS');
        fila.valores[5] = 'GENERADO (PENDIENTE FIRMA)';
        fila.valores[7] = remu; fila.valores[8] = transp; fila.valores[22] = JSON.stringify(actual);
        sheet.getRange(fila.row,1,1,23).setValues([fila.valores]);
        SpreadsheetApp.flush();
        completado = actual;
    });
    if (completado) {
        cacheEstadoCola_(completado,estadoControlCola_(completado));
        try { DriveApp.getFileById(completado.cola.payloadId).setTrashed(true); } catch(e) {}
    }
}
