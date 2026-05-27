/**
 * ==========================================================================
 * MÓDULO LÓGICA - GESTIÓN INDIVIDUAL OPTIMIZADA
 * Versión Robusta para Alta Concurrencia
 * ==========================================================================
 */

/**
 * 1. PROCESAR INFORME INDIVIDUAL
 * Genera documentos sin bloquear y luego registra rápidamente.
 */
function procesarInforme(datos) {
    const fechaActual = new Date();
    let mesProceso = String(datos.mesSeleccionado || "").toUpperCase().trim();
    let anioProceso = fechaActual.getFullYear();
    if (mesProceso === "DICIEMBRE" && fechaActual.getMonth() === 0) anioProceso = anioProceso - 1;

    // Normalizar RUT para búsquedas consistentes
    const rutCanonical = normalizarRutCanonical(datos.rut);

    const duplicadoCheck = verificarExistenciaRapida(rutCanonical, mesProceso, anioProceso);
    if (duplicadoCheck.existe && (String(duplicadoCheck.estado).includes("FINALIZADO") || (duplicadoCheck.linkRespaldo && String(duplicadoCheck.linkRespaldo).length > 15))) {
        return { exito: true, urlRemu: duplicadoCheck.linkRemu, urlTransp: duplicadoCheck.linkTransp, bloqueoTotal: true, mensajeBloqueo: "El mes ya fue finalizado." };
    }

    const rangoFechas = obtenerRangoFechas(mesProceso, anioProceso);
    datos.fechaInicioMes = rangoFechas.inicio;
    datos.fechaFinMes = rangoFechas.fin;
    const fechaFirma = Utilities.formatDate(fechaActual, CONFIG.TIMEZONE, "dd/MM/yyyy");

    try {
        // --- FASE 1: DRIVE (Paralelo) ---
        // Recuperar metadata fresca usando la función optimizada de Datos.gs
        const metaData = obtenerMetadataSegura(datos.rut);
        const carpetas = crearEstructuraCarpetas(datos, metaData, mesProceso, anioProceso);
        const archivoPlantilla = DriveApp.getFileById(CONFIG.ID_PLANTILLA);
        const nombrePdfLimpio = `${datos.nombre}.pdf`;

        const linksGenerados = retryOperationLogica(() => {
            // 1. Doc REMU — con todos los datos (para el funcionario)
            const copyRemu = archivoPlantilla.makeCopy(datos.nombre, carpetas.docs);
            const docRemu = DocumentApp.openById(copyRemu.getId());
            llenarPlantilla(docRemu.getBody(), datos, mesProceso, anioProceso, fechaFirma, true);
            docRemu.saveAndClose();

            // 2. Doc TRANSPARENCIA — copia censurada (RUT, fono, correo, nacimiento tapados)
            const copyTransp = archivoPlantilla.makeCopy(datos.nombre + "_T", carpetas.docs);
            const docTransp = DocumentApp.openById(copyTransp.getId());
            llenarPlantilla(docTransp.getBody(), datos, mesProceso, anioProceso, fechaFirma, false);
            censurarDatos(docTransp.getBody(), [
                datos.rut,
                datos.fono       || "",
                datos.correo     || "",
                datos.nacimiento || ""
            ]);
            docTransp.saveAndClose();

            // 3. Exportar ambos a PDF directamente a Google Drive vía Cloud Run
            const resCloud = llamarCloudPDF(
                copyRemu.getId(),
                copyTransp.getId(),
                carpetas.generados.getId(),
                carpetas.transp.getId(),
                nombrePdfLimpio
            );

            // 4. Borrar la copia temporal de transparencia del Doc editable
            //    (solo el PDF censurado debe quedar en Drive, no el Doc)
            DriveApp.getFileById(copyTransp.getId()).setTrashed(true);

            return {
                remu:  resCloud.urlRemu,
                transp: resCloud.urlTransp,
                docs:  copyRemu.getUrl()
            };
        }, 3);

        // --- FASE 2: SHEET (Serial con Escritura en Bloque) ---
        const datosLog = {
            mes: mesProceso, anio: anioProceso, rut: datos.rut, nombre: datos.nombre,
            estado: "GENERADO (PENDIENTE FIRMA)",
            linkRemu: linksGenerados.remu, linkTransp: linksGenerados.transp, linkDocs: linksGenerados.docs,
            linkRespaldo: "AUN SIN ADJUNTAR",
            actividades: datos.actividades,
            licencias: datos.licenciasTexto || "NO PRESENTA",
            periodos: datos.periodosTexto || "---",
            fechaInicio: datos.fechaInicioMes, fechaFin: datos.fechaFinMes,
            fono: datos.fono || "", correo: datos.correo || "",
            direccion: datos.direccion || "",
            jefaturaNombre: datos.jefaturaNombre || "", jefaturaCargo: datos.jefaturaCargo || "",
            funcion: datos.funcion || ""
        };

        const resultadoLog = registrarEnLog(datosLog);
        if (!resultadoLog.exito) {
            throw new Error("Sistema ocupado al registrar. Por favor reintente en 15 segundos.");
        }

        return { exito: true, urlRemu: linksGenerados.remu, urlTransp: linksGenerados.transp, urlDocs: linksGenerados.docs };

    } catch (e) { 
        // Lanza el error real para que el frontend (withFailureHandler) ejecute el reintento
        throw new Error(e.message || e.toString()); 
    }
}
/**
 * 2. GUARDAR ARCHIVO FIRMADO (SUBIDA FINAL)
 * También optimizado con bloqueo corto.
 */
function guardarArchivoFirmado(datos) {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(45000);

        const fechaActual = new Date();
        let mesProceso = String(datos.mes || "").toUpperCase().trim();
        let anioProceso = fechaActual.getFullYear();
        if (mesProceso === "DICIEMBRE" && fechaActual.getMonth() === 0) anioProceso = anioProceso - 1;

        // NORMALIZAR RUT para búsqueda consistente
        const rutCanonical = normalizarRutCanonical(datos.rut);
        console.log("📎 [Logica] guardarArchivoFirmado - RUT canonical: " + rutCanonical + " | Mes: " + mesProceso + " | Año: " + anioProceso);

        // Verificación rápida antes de subir
        const duplicado = verificarExistenciaRapida(rutCanonical, mesProceso, anioProceso);
        if (duplicado.existe && String(duplicado.estado).includes("FINALIZADO")) {
            throw new Error("Este periodo ya fue cerrado y finalizado correctamente.");
        }

        // 1. Guardar Archivo Físico
        const metaData = obtenerMetadataSegura(datos.rut);
        const struct = crearEstructuraCarpetas(datos, metaData, mesProceso, anioProceso);

        const decoded = Utilities.base64Decode(datos.bytes);
        let extension = "pdf";
        if (datos.mimeType.includes("jpeg") || datos.mimeType.includes("jpg")) extension = "jpg";
        if (datos.mimeType.includes("png")) extension = "png";

        const blob = Utilities.newBlob(decoded, datos.mimeType, `${datos.nombre}.${extension}`);
        const fileEscaneado = struct.remu.createFile(blob);

        // 2. Actualizar Hoja (Operación crítica) - Usar RUT canonical para que match
        const datosFinales = {
            mes: mesProceso, anio: anioProceso, rut: rutCanonical, nombre: datos.nombre,
            estado: "FINALIZADO (OK)",
            linkRemu: duplicado.linkRemu || "---",
            linkTransp: duplicado.linkTransp || "---",
            linkDocs: duplicado.linkDocs || "---",
            linkRespaldo: fileEscaneado.getUrl(),
            actividades: "---",
            licencias: duplicado.licencias || "---",
            periodos: duplicado.periodos || "---",
            fechaInicio: duplicado.fechaInicio, fechaFin: duplicado.fechaFin,
            fono: duplicado.fono, correo: duplicado.correo
        };

        const resultadoLog = registrarEnLog(datosFinales);
        if (!resultadoLog.exito) {
            console.error("⚠️ [Logica] Archivo subido pero fallo al actualizar registro: " + resultadoLog.error);
        }

        return { exito: true };

    } catch (e) {
        throw new Error(e.toString());
    } finally {
        lock.releaseLock();
    }
}

function guardarArchivosDual(payload) {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(45000);
        const anioProceso = new Date().getFullYear();
        let mesProceso = String(payload.mes || "").toUpperCase().trim();
        const rutCanonical = normalizarRutCanonical(payload.rut);

        const duplicado = verificarExistenciaRapida(rutCanonical, mesProceso, anioProceso);
        if (duplicado.existe && String(duplicado.estado).includes("FINALIZADO")) {
            throw new Error("Este periodo ya fue cerrado y finalizado correctamente.");
        }

        const datos = payload.datosExtra || {};
        datos.rut = rutCanonical;
        datos.nombre = payload.nombre;

        const metaData = obtenerMetadataSegura(rutCanonical);
        const struct = crearEstructuraCarpetas(datos, metaData, mesProceso, anioProceso);

        const blobTransp = Utilities.newBlob(Utilities.base64Decode(payload.rawTransp), payload.mimeTransp, `${payload.nombre}_Transparencia.${payload.extTransp}`);
        const fileTransp = struct.transp.createFile(blobTransp);

        const blobBoleta = Utilities.newBlob(Utilities.base64Decode(payload.rawBoleta), payload.mimeBoleta, `${payload.nombre}_Boleta.${payload.extBoleta}`);
        const fileBoleta = struct.remu.createFile(blobBoleta);

        const datosFinales = {
            mes: mesProceso, anio: anioProceso, rut: rutCanonical, nombre: payload.nombre,
            estado: "FINALIZADO (OK)",
            linkRemu: fileBoleta.getUrl(),
            linkTransp: fileTransp.getUrl(),
            linkDocs: "SIN GENERACIÓN - ADJUNTO DIRECTO",
            linkRespaldo: fileBoleta.getUrl(), // Usa este también como base general
            actividades: datos.actividades || "---",
            licencias: datos.licenciasTexto || "NO PRESENTA",
            periodos: datos.periodosTexto || "---",
            fechaInicio: datos.fechaInicioMes || "---",
            fechaFin: datos.fechaFinMes || "---",
            fono: datos.fono || "---", correo: datos.correo || "---",
            direccion: datos.direccion || "---",
            jefaturaNombre: datos.jefaturaNombre || "---", jefaturaCargo: datos.jefaturaCargo || "---",
            funcion: datos.funcion || "---"
        };

        const resLog = registrarEnLog(datosFinales);
        if (!resLog.exito) throw new Error(resLog.error);

        return { exito: true };
    } catch (e) {
        throw new Error(e.toString());
    } finally {
        lock.releaseLock();
    }
}

function guardarArchivoDualLote(payload) {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(45000);
        const anioProceso = new Date().getFullYear();
        let mesProceso = String(payload.mes || "").toUpperCase().trim();
        const rutCanonical = normalizarRutCanonical(payload.rut);

        const duplicado = verificarExistenciaRapida(rutCanonical, mesProceso, anioProceso);

        const datos = payload.datosExtra || {};
        datos.rut = rutCanonical;
        datos.nombre = payload.nombre;

        const metaData = obtenerMetadataSegura(rutCanonical);
        const struct = crearEstructuraCarpetas(datos, metaData, mesProceso, anioProceso);

        const blob = Utilities.newBlob(Utilities.base64Decode(payload.bytes), payload.mimeType, payload.fileName);

        let fileUrl = "";
        if (payload.tipo === 'transp') {
            let f = struct.transp.createFile(blob);
            fileUrl = f.getUrl();
        } else {
            let f = struct.remu.createFile(blob);
            fileUrl = f.getUrl();
        }

        const linkTranspPrevio = duplicado.linkTransp || "---";
        const linkRemuPrevio = duplicado.linkRemu || "---";

        const datosFinales = {
            mes: mesProceso, anio: anioProceso, rut: rutCanonical, nombre: payload.nombre,
            estado: "PROCESO DUAL",
            linkRemu: payload.tipo === 'remu' ? fileUrl : linkRemuPrevio,
            linkTransp: payload.tipo === 'transp' ? fileUrl : linkTranspPrevio,
            linkDocs: "SIN GENERACIÓN - ADJUNTO DIRECTO",
            linkRespaldo: payload.tipo === 'remu' ? fileUrl : (duplicado.linkRespaldo || "---"),
            actividades: datos.actividades || "---",
            licencias: duplicado.licencias || datos.licenciasTexto || "NO PRESENTA",
            periodos: duplicado.periodos || datos.periodosTexto || "---",
            fechaInicio: duplicado.fechaInicio || datos.fechaInicioMes || "---",
            fechaFin: duplicado.fechaFin || datos.fechaFinMes || "---",
            fono: duplicado.fono || datos.fono || "---", correo: duplicado.correo || datos.correo || "---",
            direccion: datos.direccion || "---",
            jefaturaNombre: datos.jefaturaNombre || "---", jefaturaCargo: datos.jefaturaCargo || "---",
            funcion: datos.funcion || "---"
        };

        // Determinar finalizado
        const checkT = datosFinales.linkTransp !== "---";
        const checkR = datosFinales.linkRemu !== "---";
        if (checkT && checkR) {
            datosFinales.estado = "FINALIZADO (OK)";
        }

        const resLog = registrarEnLog(datosFinales);
        if (!resLog.exito) throw new Error(resLog.error);

        return { exito: true, url: fileUrl };
    } catch (e) {
        throw new Error(e.toString());
    } finally {
        lock.releaseLock();
    }
}

/**
 * 3. REGISTRO EN LOG (CANÓNICO)
 * Única función de registro. Usa TextFinder + LockService + RUT canonical.
 */
function registrarEnLog(data): { exito: boolean; error?: string } {
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    let sheet = ss.getSheetByName(CONFIG.TAB_LOG);

    if (!sheet) {
        // Crear hoja si no existe
        sheet = ss.insertSheet(CONFIG.TAB_LOG);
        const headers = [
            'TIMESTAMP', 'MES INFORME', 'AÑO', 'RUT', 'NOMBRE', 'ESTADO',
            'LINK DOCS', 'LINK PDF REMU', 'LINK PDF TRANSP', 'LINK RESPALDO ESCANEADO',
            'RESUMEN ACTIVIDADES', 'FUNCIÓN (CONTRATO)', 'Dificultades y Propuestas',
            'LICENCIAS', 'PERIODOS LICENCIAS', 'CORREO', 'TELEFONO',
            'PERIODO_INICIO', 'PERIODO_FIN',
            'Nombre Jefatura', 'Cargo', 'Direccion/Depto/Of'
        ];
        sheet.appendRow(headers);
        sheet.setFrozenRows(1);
    }

    // --- BÚSQUEDA RÁPIDA CON RUT CANONICAL ---
    const rutCanonical = normalizarRutCanonical(data.rut);
    const lastRow = sheet.getLastRow();
    const mesNorm = String(data.mes).toUpperCase().trim();

    let filaEncontrada = -1;

    if (lastRow > 1) {
        // Buscar con el RUT canonical (con guión) en columna D
        const buscador = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutCanonical).matchEntireCell(true);
        let ocurrencias = buscador.findAll();

        // Si no encuentra con canonical, intentar búsqueda parcial sin guión
        if (ocurrencias.length === 0) {
            const rutSinGuion = rutCanonical.replace(/-/g, '');
            const buscador2 = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutSinGuion);
            ocurrencias = buscador2.findAll();
        }

        // Buscar coincidencia exacta de MES y AÑO (hacia atrás)
        for (let i = ocurrencias.length - 1; i >= 0; i--) {
            let row = ocurrencias[i].getRow();
            let checkData = sheet.getRange(row, 2, 1, 2).getValues()[0];
            if (String(checkData[0]).toUpperCase().trim() === mesNorm && String(checkData[1]).trim() == data.anio) {
                filaEncontrada = row;
                break;
            }
        }
    }

    console.log("📝 [Logica] registrarEnLog - RUT: " + rutCanonical + " | Fila encontrada: " + filaEncontrada);

    const timestamp = new Date();
    const linkRespaldoFinal = data.linkRespaldo || "AUN SIN ADJUNTAR";
    const valorLicencia = data.licencias || "NO PRESENTA";

    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(60000); // Aumentado para alta concurrencia

        if (filaEncontrada > 0) {
            // ACTUALIZAR FILA EXISTENTE
            const rangeLinks = sheet.getRange(filaEncontrada, 6, 1, 5);
            const valoresLinks = [[
                data.estado,
                data.linkDocs || "---",
                data.linkRemu || "---",
                data.linkTransp || "---",
                linkRespaldoFinal
            ]];
            rangeLinks.setValues(valoresLinks);

            sheet.getRange(filaEncontrada, 1).setValue(timestamp);

            if (data.actividades && data.actividades !== "---") {
                sheet.getRange(filaEncontrada, 11).setValue(data.actividades);
                sheet.getRange(filaEncontrada, 12).setValue(data.funcion || "---"); // ACTUALIZAR FUNCIÓN
                sheet.getRange(filaEncontrada, 13).setValue(data.dificultades || "Sin dificultades");
                sheet.getRange(filaEncontrada, 14).setValue(valorLicencia);
                if (data.periodos) sheet.getRange(filaEncontrada, 15).setValue(data.periodos);
                if (data.fechaInicio) sheet.getRange(filaEncontrada, 18).setValue(data.fechaInicio);
                if (data.fechaFin) sheet.getRange(filaEncontrada, 19).setValue(data.fechaFin);
                if (data.jefaturaNombre) sheet.getRange(filaEncontrada, 20).setValue(data.jefaturaNombre);
                if (data.jefaturaCargo) sheet.getRange(filaEncontrada, 21).setValue(data.jefaturaCargo);
                if (data.jefaturaDireccion) sheet.getRange(filaEncontrada, 22).setValue(data.jefaturaDireccion);
            }

            if (data.correo) sheet.getRange(filaEncontrada, 16).setValue(data.correo);
            if (data.fono) sheet.getRange(filaEncontrada, 17).setValue(data.fono);

        } else {
            // CREAR NUEVA FILA (Solo si no existe)
            console.warn("⚠️ [Logica] No se encontró fila existente para RUT " + rutCanonical + ". Creando nueva fila.");
            sheet.appendRow([
                timestamp,              // A
                data.mes,               // B
                data.anio,              // C
                rutCanonical,           // D - Guardar siempre en formato canonical
                data.nombre,            // E
                data.estado,            // F
                data.linkDocs || "---", // G
                data.linkRemu || "---", // H
                data.linkTransp || "---", // I
                linkRespaldoFinal,      // J
                data.actividades || "---", // K
                data.funcion || "---",     // L
                data.dificultades || "Sin dificultades", // M
                valorLicencia,          // N
                data.periodos || "---", // O
                data.correo || "---",   // P
                data.fono || "---",     // Q
                data.fechaInicio || "---", // R
                data.fechaFin || "---",    // S
                data.jefaturaNombre || "---", // T
                data.jefaturaCargo || "---",  // U
                data.direccion || "---"       // V
            ]);
        }
        return { exito: true };

    } catch (e) {
        console.error("Error en registrarEnLog: " + e.toString());
        return { exito: false, error: e.toString() };
    } finally {
        lock.releaseLock();
    }
}

/**
 * UTILS: Verificación ultrarrápida (Solo lectura)
 */
function verificarExistenciaRapida(rut, mes, anio) {
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    const sheet = ss.getSheetByName(CONFIG.TAB_LOG);
    if (!sheet) return { existe: false };

    const rutCanonical = normalizarRutCanonical(rut);
    const mesNorm = String(mes).toUpperCase().trim();
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) return { existe: false };

    // Buscar con RUT canonical (con guión)
    let buscador = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutCanonical);
    let ocurrencias = buscador.findAll();

    // Fallback: buscar sin guión si no hay resultados
    if (ocurrencias.length === 0) {
        const rutSinGuion = rutCanonical.replace(/-/g, '');
        buscador = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutSinGuion);
        ocurrencias = buscador.findAll();
    }

    for (let i = ocurrencias.length - 1; i >= 0; i--) {
        let row = ocurrencias[i].getRow();
        // Leer hasta columna S (19) para incluir fechaInicio y fechaFin
        let dataRow = sheet.getRange(row, 1, 1, 19).getValues()[0];

        let rowMes = String(dataRow[1]).toUpperCase().trim(); // Col B
        let rowAnio = String(dataRow[2]).trim(); // Col C

        if (rowMes === mesNorm && rowAnio == anio) {
            return {
                existe: true,
                estado: dataRow[5],      // Col F
                linkDocs: dataRow[6],    // Col G
                linkRemu: dataRow[7],    // Col H
                linkTransp: dataRow[8],  // Col I
                linkRespaldo: dataRow[9],// Col J
                actividades: dataRow[10],// Col K
                licencias: dataRow[13],  // Col N
                periodos: dataRow[14],   // Col O
                correo: dataRow[15],     // Col P
                fono: dataRow[16],       // Col Q
                fechaInicio: dataRow[17],// Col R
                fechaFin: dataRow[18]    // Col S
            };
        }
    }
    return { existe: false };
}

/**
 * UTILS: Reintentos para Drive
 */
function retryOperationLogica(operation, maxRetries) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return operation();
        } catch (e) {
            if (i === maxRetries - 1) throw e;
            const delay = 1000 * Math.pow(2, i); // Exponential Backoff real: 1s, 2s, 4s...
            console.warn(`[Logica] Intento ${i + 1} fallido. Reintentando en ${delay/1000}s. Error: ${e.toString()}`);
            Utilities.sleep(delay);
        }
    }
}

/**
 * 5. ENVIAR REPORTE CORREO (Sin cambios, solo se incluye para que no falte)
 */
function enviarReporteProblema(datos) {
    try {
        const userEmail = Session.getActiveUser().getEmail();
        const destinatario = "renato.alvarez@municoquimbo.cl";
        const asunto = `[SOPORTE HONORARIOS] Reporte de ${datos.nombre}`;
        const cuerpo = `
            Estimado Renato,
            
            El funcionario ${datos.nombre} (RUT: ${datos.rut}) ha reportado el siguiente problema:
            
            ------------------------------------------------
            MENSAJE DEL USUARIO:
            ${datos.mensaje}
            ------------------------------------------------
            
            Correo AppScript (Sesión): ${userEmail}
            Fono: ${datos.fono}
            Correo (Formulario): ${datos.correo}
        `;

        MailApp.sendEmail(destinatario, asunto, cuerpo);
        return { exito: true };
    } catch (e) {
        return { exito: false, error: e.toString() };
    }
}

/**
 * 6. LLAMAR A LA API EN GOOGLE CLOUD RUN PARA GENERACIÓN RÁPIDA DE PDF
 * Delegación híbrida de PDF y tachado para evitar los timeouts de Google Drive
 */
function llamarCloudPDF(docIdRemu, docIdTransp, folderIdRemu, folderIdTransp, nombrePdf) {
    const urlCloud = "https://generar-pdf-honorarios-92298248454.us-central1.run.app/generarPDF";

    const payload = {
        docIdRemu:  docIdRemu,
        docIdTransp: docIdTransp,
        folderIdRemu: folderIdRemu,
        folderIdTransp: folderIdTransp,
        nombrePdf: nombrePdf
    };

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(urlCloud, options);
    const code     = response.getResponseCode();
    const bodyText = response.getContentText();

    if (code !== 200) {
        throw new Error("Error en API de Cloud Run (" + code + "): " + bodyText);
    }

    const resJson = JSON.parse(bodyText);
    if (!resJson.exito) {
        throw new Error("Error Cloud Run: " + (resJson.error || "Desconocido"));
    }

    return resJson; // { exito, urlRemu, urlTransp }
}