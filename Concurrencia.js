/**
 * Reservas por RUT y periodo. El candado protege únicamente Sheets/Properties;
 * ninguna operación Drive, Docs o HTTP se ejecuta dentro de este candado.
 * Los puntos de recuperación permanecen en la columna W del registro histórico.
 */
const INFORMES_HEADERS = [
    'TIMESTAMP', 'MES INFORME', 'AÑO', 'RUT', 'NOMBRE', 'ESTADO',
    'LINK DOCS', 'LINK PDF REMU', 'LINK PDF TRANSP', 'LINK RESPALDO ESCANEADO',
    'RESUMEN ACTIVIDADES', 'FUNCIÓN (CONTRATO)', 'Dificultades y Propuestas',
    'LICENCIAS', 'PERIODOS LICENCIAS', 'CORREO', 'TELEFONO',
    'PERIODO_INICIO', 'PERIODO_FIN', 'Nombre Jefatura', 'Cargo', 'Direccion/Depto/Of',
    'CONTROL OPERACION'
];
const INFORMES_MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

function conBloqueoInformes_(accion, esperaMs) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(esperaMs === undefined ? 5000 : esperaMs)) throw new Error('OCUPADO: Intente nuevamente en unos segundos.');
    try { return accion(); }
    finally { lock.releaseLock(); }
}

function resolverPeriodo_(mes, anio) {
    const hoy = new Date();
    const anioLocal = Number(Utilities.formatDate(hoy, CONFIG.TIMEZONE, 'yyyy'));
    const mesLocal = Number(Utilities.formatDate(hoy, CONFIG.TIMEZONE, 'MM'));
    const nombre = String(mes || '').trim().toUpperCase();
    if (INFORMES_MESES.indexOf(nombre) < 0) throw new Error('Seleccione un mes válido.');
    const valor = anio === undefined || anio === null || anio === ''
        ? anioLocal - (mesLocal === 1 && nombre === 'DICIEMBRE' ? 1 : 0) : Number(anio);
    if (!Number.isInteger(valor) || valor < anioLocal - 1 || valor > anioLocal) {
        throw new Error('El año del informe no es válido.');
    }
    return { mes: nombre, anio: valor };
}

function urlDriveValida_(valor) {
    return /^https:\/\/(drive|docs)\.google\.com\/[A-Za-z0-9_/%?.=&+#-]+$/.test(String(valor || ''));
}

function textoParaHoja_(valor) {
    // setValues interpreta '=' como fórmula. El texto del formulario es literal.
    const texto = String(valor === undefined || valor === null ? '' : valor);
    return /^[=+@\-]/.test(texto) ? "'" + texto : texto;
}

function hojaInformes_() {
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    let sheet = ss.getSheetByName(CONFIG.TAB_LOG);
    if (!sheet) sheet = ss.insertSheet(CONFIG.TAB_LOG);
    if (sheet.getMaxColumns() < INFORMES_HEADERS.length) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), INFORMES_HEADERS.length - sheet.getMaxColumns());
    }
    if (!sheet.getLastRow()) {
        sheet.getRange(1, 1, 1, INFORMES_HEADERS.length).setValues([INFORMES_HEADERS]);
        sheet.setFrozenRows(1);
    } else if (!sheet.getRange(1, 23).getValue()) {
        sheet.getRange(1, 23).setValue(INFORMES_HEADERS[22]);
    }
    return sheet;
}

function buscarFilaInforme_(sheet, rut, mes, anio) {
    const last = sheet.getLastRow();
    if (last < 2) return null;
    const canon = normalizarRutCanonical_(rut);
    // Coincidencia completa: también admite formatos históricos con puntos/cero inicial.
    const partes = canon.split('-');
    const digitos = partes[0].replace(/^0+/, '').split('').join('\\.?');
    const patron = '^0*' + digitos + '-?' + partes[1] + '$';
    const encontrados = sheet.getRange(2, 4, last - 1, 1).createTextFinder(patron)
        .useRegularExpression(true).matchCase(false).matchEntireCell(true).findAll();
    for (let i = encontrados.length - 1; i >= 0; i--) {
        const row = encontrados[i].getRow();
        const valores = sheet.getRange(row, 1, 1, Math.min(23, sheet.getMaxColumns())).getValues()[0];
        while (valores.length < 23) valores.push('');
        if (normalizarRutCanonical_(valores[3]) === canon &&
            String(valores[1]).trim().toUpperCase() === mes && Number(valores[2]) === Number(anio)) {
            return { row: row, valores: valores };
        }
    }
    return null;
}

function registroDesdeFila_(fila) {
    if (!fila) return { existe: false };
    const r = fila.valores;
    return { existe: true, estado: String(r[5]), linkDocs: r[6], linkRemu: r[7],
        linkTransp: r[8], linkRespaldo: r[9], actividades: r[10], funcion: r[11],
        dificultades: r[12], licencias: r[13], periodos: r[14], correo: r[15], fono: r[16],
        fechaInicio: r[17], fechaFin: r[18], jefaturaNombre: r[19], jefaturaCargo: r[20],
        direccion: r[21], rutFormateado: r[3] };
}

function registrarEnLogSinBloqueo_(data, control) {
    const sheet = hojaInformes_();
    const p = resolverPeriodo_(data.mes, data.anio);
    const rut = normalizarRutCanonical_(data.rut);
    const encontrada = buscarFilaInforme_(sheet, rut, p.mes, p.anio);
    const valores = encontrada ? encontrada.valores.slice() : Array(23).fill('---');
    const previoFinal = encontrada && String(valores[5]).indexOf('FINALIZADO') >= 0;
    if (previoFinal && String(data.estado || '').indexOf('FINALIZADO') < 0) {
        throw new Error('Este periodo ya está finalizado.');
    }
    valores[0] = new Date(); valores[1] = p.mes; valores[2] = p.anio; valores[3] = rut;
    const campos = { nombre: 4, estado: 5, linkDocs: 6, linkRemu: 7, linkTransp: 8,
        linkRespaldo: 9, actividades: 10, funcion: 11, dificultades: 12, licencias: 13,
        periodos: 14, correo: 15, fono: 16, fechaInicio: 17, fechaFin: 18,
        jefaturaNombre: 19, jefaturaCargo: 20, direccion: 21 };
    Object.keys(campos).forEach(function(campo) {
        if (data[campo] !== undefined && data[campo] !== null &&
            (!encontrada || (data[campo] !== '' && data[campo] !== '---'))) {
            valores[campos[campo]] = textoParaHoja_(data[campo]);
        }
    });
    if (control) valores[22] = JSON.stringify(control);
    const row = encontrada ? encontrada.row : sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, 23).setValues([valores]);
    SpreadsheetApp.flush();
    return { exito: true, row: row };
}

function leerControl_(fila) {
    if (!fila || !fila.valores[22] || fila.valores[22] === '---') return {};
    try { return JSON.parse(fila.valores[22]); }
    catch (e) { throw new Error('Control de recuperación inválido. Contacte a soporte.'); }
}

function reservarOperacion_(datos, tipo) {
    return conBloqueoInformes_(function() {
        const p = resolverPeriodo_(datos.mesSeleccionado || datos.mes, datos.anio);
        const rut = normalizarRutCanonical_(datos.rut);
        if (!/^\d{8}-[0-9K]$/.test(rut)) throw new Error('RUT inválido.');
        const sheet = hojaInformes_();
        const fila = buscarFilaInforme_(sheet, rut, p.mes, p.anio);
        const previo = registroDesdeFila_(fila);
        if (String(previo.estado || '').indexOf('FINALIZADO') >= 0 ||
            (tipo === 'generacion' && urlDriveValida_(previo.linkRespaldo) &&
                String(previo.estado || '').indexOf('PROCESO DUAL') < 0)) {
            return { finalizado: true, previo: previo, periodo: p };
        }
        if (tipo === 'generacion' && urlDriveValida_(previo.linkRemu) && urlDriveValida_(previo.linkTransp)) {
            return { recuperado: true, previo: previo, periodo: p };
        }
        const props = PropertiesService.getScriptProperties();
        const activos = JSON.parse(props.getProperty('INFORMES_ACTIVOS') || '{}');
        const ahora = Date.now();
        Object.keys(activos).forEach(function(k) { if (activos[k].vence <= ahora) delete activos[k]; });
        const clave = p.anio + '_' + p.mes + '_' + rut;
        if (activos[clave]) throw new Error('EN_PROCESO: Este informe está siendo procesado.');
        const maximo = tipo === 'generacion' ? CONFIG.MAX_GENERACIONES : CONFIG.MAX_SUBIDAS;
        if (Object.keys(activos).filter(function(k) { return activos[k].tipo === tipo; }).length >= maximo) {
            throw new Error('OCUPADO: Hay solicitudes en curso. Su solicitud puede reintentarse.');
        }
        const control = leerControl_(fila);
        if (tipo === 'subida' && control.cola && control.cola.pendiente) {
            throw new Error('EN_COLA: La generación de este periodo aún debe terminar antes de recibir su entrega.');
        }
        if (tipo === 'generacion') {
            const campos = ['funcion', 'funcionHtml', 'actividades', 'dificultades', 'fechaInicioMes',
                'fechaFinMes', 'fono', 'correo', 'jefaturaNombre', 'jefaturaCargo', 'jefaturaDireccion',
                'datoLicencia', 'datoEnfermedad', 'datoVacaciones'];
            const contenido = campos.map(function(k) { return [k, String(datos[k] || '')]; });
            if (datos.actividadesFormato) contenido.push(['actividadesFormato', datos.actividadesFormato]);
            const huella = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(contenido)));
            if (control.huella && control.huella !== huella) {
                const a=control.archivos || {};
                const rechazoAutenticacion=a.cloudAutenticacionRechazada || /^CLOUD_HTTP_401:/.test(String(control.error || ''));
                const sinArchivos=a.motorPDF==='HTML' && !a.cloudPendiente && !a.cloudRespuestaConfirmada &&
                    !a.docRemu && !a.docTransp && !a.pdfRemu && !a.pdfTransp && !a.urlRemu && !a.urlTransp &&
                    !urlDriveValida_(previo.linkRemu) && !urlDriveValida_(previo.linkTransp);
                if (!rechazoAutenticacion || !sinArchivos) throw new Error('El informe ya tiene una generación iniciada con otros datos. Contacte a soporte para corregirlo.');
                // Un 401 confirmado no generó documentos: permite corregir la jefatura sin liberar el bloqueo mensual.
                control.id=Utilities.getUuid();
                control.archivos={motorPDF:'HTML'};
                agregarEventoOperacion_(control,'DATOS CORREGIDOS TRAS RECHAZO DE AUTENTICACION SIN ARCHIVOS');
            }
            control.huella = huella;
        }
        if (tipo === 'generacion' && control.cola && control.cola.pendiente) {
            return { encolado: true, control: control };
        }
        control.id = control.id || Utilities.getUuid();
        control.archivos = control.archivos || {};
        control.fase = tipo === 'generacion' ? 'GENERANDO' : 'SUBIENDO';
        control.actualizado = new Date().toISOString();
        control.intentos = (control.intentos || 0) + 1;
        control.error = '';
        agregarEventoOperacion_(control, control.fase);
        const lease = Utilities.getUuid();
        const registro = tipo === 'generacion' ? datosParaRegistro_(datos, p) : {
            rut: rut, nombre: datos.nombre, mes: p.mes, anio: p.anio
        };
        // No cambiar GENERADO por SUBIENDO: los links deben seguir siendo recuperables.
        if (tipo === 'generacion') registro.estado = 'GENERANDO';
        const guardado = registrarEnLogSinBloqueo_(registro, control);
        activos[clave] = { tipo: tipo, lease: lease, vence: ahora + 8 * 60 * 1000 };
        props.setProperty('INFORMES_ACTIVOS', JSON.stringify(activos));
        return { clave: clave, lease: lease, control: control, previo: previo,
            periodo: p, rut: rut, sheet: sheet, row: guardado.row };
    }, 500);
}

// Admisión preliminar sin Sheets ni espera por candado. La reserva bajo lock sigue siendo autoritativa.
function comprobarCupoInformes_(tipo) {
    comprobarPausaCuota_(tipo);
    const activos = JSON.parse(PropertiesService.getScriptProperties().getProperty('INFORMES_ACTIVOS') || '{}');
    const ahora = Date.now();
    const limite = tipo === 'generacion' ? CONFIG.MAX_GENERACIONES : CONFIG.MAX_SUBIDAS;
    if (Object.keys(activos).filter(k => activos[k].tipo === tipo && activos[k].vence > ahora).length >= limite) {
        throw new Error('OCUPADO: Hay solicitudes en curso. Su solicitud puede reintentarse.');
    }
}

function comprobarPausaCuota_(tipo) {
    let pausa;
    try { pausa = CacheService.getScriptCache().get('PAUSA_CUOTA_V1_' + tipo); } catch(e) { return; }
    if (pausa && Number(pausa) > Date.now()) {
        throw new Error('CUOTA_PAUSADA: El servicio alcanzó una cuota. Espere unos minutos y conserve su informe; no se repetirá la operación automáticamente.');
    }
}

// Reduce operaciones fallidas de todos los navegadores tras un error explícito de cuota.
// No intenta adivinar cuándo Google restablecerá la cuota; la pausa solo contiene el tráfico.
function registrarPausaCuota_(error, tipo) {
    const texto = String(error && error.message || error);
    const diario = /Service invoked too many times:/i.test(texto) ||
        /for one day|daily quota|quota exceeded|QUOTA_EXCEEDED/i.test(texto);
    if (!diario || /in a short time/i.test(texto)) return;
    const tipos = /drive|spreadsheet/i.test(texto) ? ['generacion', 'subida'] : [tipo];
    try {
        const cache = CacheService.getScriptCache();
        tipos.forEach(t => cache.put('PAUSA_CUOTA_V1_' + t, String(Date.now() + 900000), 900));
    } catch(e) { console.warn('No se pudo registrar la pausa de cuota.'); }
}

function guardarPuntoControl_(op, fase) {
    op.control.fase = fase;
    op.control.actualizado = new Date().toISOString();
    agregarEventoOperacion_(op.control, fase);
    conBloqueoInformes_(function() {
        const activos = JSON.parse(PropertiesService.getScriptProperties().getProperty('INFORMES_ACTIVOS') || '{}');
        if (!activos[op.clave] || activos[op.clave].lease !== op.lease) {
            throw new Error('La reserva del informe cambió. Contacte a soporte.');
        }
        const sheet = op.sheet || hojaInformes_();
        // El índice de fila es una pista, nunca autoridad: soporte puede ordenar la hoja.
        const identidad = op.row ? sheet.getRange(op.row, 2, 1, 3).getValues()[0] : [];
        if (String(identidad[0]).trim().toUpperCase() !== op.periodo.mes ||
            Number(identidad[1]) !== op.periodo.anio || normalizarRutCanonical_(identidad[2]) !== op.rut) {
            const fila = buscarFilaInforme_(sheet, op.rut, op.periodo.mes, op.periodo.anio);
            if (!fila) throw new Error('El registro de la operación no existe. Contacte a soporte.');
            op.row = fila.row;
        }
        sheet.getRange(op.row, 23).setValue(JSON.stringify(op.control));
        SpreadsheetApp.flush();
    });
}

function terminarOperacion_(op, registro, error) {
    if (!op || !op.clave) return;
    conBloqueoInformes_(function() {
        const props = PropertiesService.getScriptProperties();
        const activos = JSON.parse(props.getProperty('INFORMES_ACTIVOS') || '{}');
        if (!activos[op.clave] || activos[op.clave].lease !== op.lease) {
            throw new Error('La reserva del informe cambió. Contacte a soporte.');
        }
        op.control.fase = error ? 'ERROR RECUPERABLE' : 'COMPLETADO';
        op.control.error = error ? String(error.message || error).substring(0, 300) : '';
        op.control.actualizado = new Date().toISOString();
        agregarEventoOperacion_(op.control, op.control.fase);
        const data = Object.assign({ rut: op.rut, mes: op.periodo.mes, anio: op.periodo.anio }, registro || {});
        if (error && activos[op.clave].tipo === 'generacion') data.estado = 'ERROR RECUPERABLE';
        registrarEnLogSinBloqueo_(data, op.control);
        delete activos[op.clave];
        props.setProperty('INFORMES_ACTIVOS', JSON.stringify(activos));
    });
}

function agregarEventoOperacion_(control, fase) {
    control.eventos = control.eventos || [];
    control.eventos.push({ fecha: new Date().toISOString(), fase: fase });
    // Mantener el control por debajo del límite de tamaño de una celda de Sheets.
    control.eventos = control.eventos.slice(-40);
}

function datosParaRegistro_(d, p) {
    return { rut: d.rut, nombre: d.nombre, mes: p.mes, anio: p.anio,
        actividades: d.actividades, funcion: d.funcion, dificultades: d.dificultades,
        licencias: d.licenciasTexto || 'NO PRESENTA', periodos: d.periodosTexto,
        correo: d.correo, fono: d.fono, fechaInicio: d.fechaInicioMes, fechaFin: d.fechaFinMes,
        jefaturaNombre: d.jefaturaNombre, jefaturaCargo: d.jefaturaCargo,
        direccion: d.jefaturaDireccion || d.direccion };
}

function validarDatosInforme_(d) {
    if (!d || typeof d !== 'object') throw new Error('Faltan los datos del informe.');
    ['rut', 'nombre', 'funcion', 'actividades', 'jefaturaNombre', 'jefaturaCargo', 'fono', 'correo'].forEach(function(c) {
        if (!String(d[c] || '').trim()) throw new Error('Debe completar: ' + c + '.');
    });
    if (String(d.actividades).trim().length < 10) throw new Error('Describa las actividades del mes.');
    Object.keys(d).forEach(function(c) {
        if (c !== 'actividadesFormato' && typeof d[c] === 'string' && d[c].length > 30000) throw new Error('El campo ' + c + ' es demasiado largo.');
    });
    validarFormatoActividades_(d.actividadesFormato, d.actividades);
    if (d.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) throw new Error('Correo inválido.');
}

function validarAdjunto_(base64, mime) {
    const tipos = ['application/pdf', 'image/jpeg', 'image/png'];
    if (tipos.indexOf(mime) < 0) throw new Error('Adjunte un PDF, JPG o PNG.');
    if (typeof base64 !== 'string' || !base64 || base64.length > 6990510 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Archivo inválido o mayor a 5 MB.');
    const bytes = Utilities.base64Decode(base64);
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('El archivo debe tener entre 1 byte y 5 MB.');
    const hex = bytes.slice(0, 8).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
    if ((mime === 'application/pdf' && hex.indexOf('255044462d') !== 0) ||
        (mime === 'image/jpeg' && hex.indexOf('ffd8ff') !== 0) ||
        (mime === 'image/png' && hex !== '89504e470d0a1a0a')) throw new Error('El contenido del archivo no coincide con su formato.');
    return bytes;
}
