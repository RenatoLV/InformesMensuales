/**
 * ==========================================================================
 * BACKEND ROBUSTO - GESTIÓN DE INFORMES MASIVOS (TS)
 * Optimizada para concurrencia con Google Workspace Enterprise
 * ==========================================================================
 */

/**
 * 1. FORMATEO DE RUT (Fuente única de verdad)
 */
function formatearRutParaBD(rut: any): string {
  if (typeof normalizarRutCanonical === 'function') {
    return normalizarRutCanonical(rut);
  }
  
  if (!rut) return "";
  let limpio = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return rut;
  let dv = limpio.slice(-1);
  let cuerpo = limpio.slice(0, -1);
  while (cuerpo.length < 8) {
    cuerpo = "0" + cuerpo;
  }
  return cuerpo + "-" + dv;
}

/**
 * 2. INICIALIZACIÓN DE LOTE (Escritura Atómica con Bloqueo Corto)
 * Crea los espacios en la hoja para reservar el lugar de los registros.
 */
function inicializarLoteEnSheet(listaDatos: any[]): any[] {
  const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
  let sheet = ss.getSheetByName(CONFIG.TAB_LOG);
  
  const headers = [
    'TIMESTAMP', 'MES INFORME', 'AÑO', 'RUT', 'NOMBRE', 'ESTADO', 
    'LINK DOCS', 'LINK PDF REMU', 'LINK PDF TRANSP', 'LINK RESPALDO ESCANEADO', 
    'RESUMEN ACTIVIDADES', 'FUNCIÓN (CONTRATO)', 'Dificultades y Propuestas', 
    'LICENCIAS', 'PERIODOS LICENCIAS', 'CORREO', 'TELEFONO', 
    'PERIODO_INICIO', 'PERIODO_FIN', 
    'Nombre Jefatura', 'Cargo', 'Direccion/Depto/Of'
  ];

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.TAB_LOG);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }

  // --- OPTIMIZACIÓN DE MEMORIA ---
  const ultimaFila = sheet.getLastRow();
  const mapaExistentes: { [key: string]: boolean } = {};

  if (ultimaFila > 1) {
    // sheet.getRange(row, col, numRows, numCols) -> Col 2(Mes), 3(Año), 4(Rut)
    const datosClave = sheet.getRange(2, 2, ultimaFila - 1, 3).getValues(); 
    
    for (let i = 0; i < datosClave.length; i++) {
        let rRaw = String(datosClave[i][2]);
        let rKey = rRaw.replace(/[^0-9kK]/g, '').toUpperCase(); 
        
        let mesKey = String(datosClave[i][0]).toUpperCase().trim();
        let anioKey = String(datosClave[i][1]).trim();
        
        let key = rKey + "_" + mesKey + "_" + anioKey;
        mapaExistentes[key] = true; 
    }
  }

  const timestamp = new Date();
  const nuevasFilas: any[][] = [];
  const resultados: any[] = [];
  
  listaDatos.forEach(dato => {
    let rutInputClean = String(dato.rut).replace(/[^0-9kK]/g, '').toUpperCase();
    let mesInput = String(dato.mesSeleccionado).toUpperCase().trim();
    let anioInput = String(dato.anio).trim();
    
    let key = rutInputClean + "_" + mesInput + "_" + anioInput;
    let rutGuardar = formatearRutParaBD(dato.rut);

    if (mapaExistentes[key]) {
      resultados.push({ rut: rutGuardar, estado: "SIN GENERAR", mensaje: "Ya existe registro (Omitido)" });
    } else {
      nuevasFilas.push([
        timestamp,                          // A: Timestamp
        dato.mesSeleccionado,               // B: Mes
        dato.anio,                          // C: Año
        rutGuardar,                         // D: Rut
        dato.nombre,                        // E: Nombre
        "SIN GENERAR",                      // F: Estado
        "---", "---", "---", "AUN SIN ADJUNTAR", // G-J: Links
        dato.actividades || "---",          // K: Actividades
        dato.funcion || "---",              // L: Función
        dato.dificultades || "Sin dificultades", // M: Dificultades
        dato.licenciasTexto || "NO PRESENTA", // N: Licencia Texto
        dato.periodosTexto || "---",        // O: Periodos Texto
        dato.correo || "",                  // P: Correo
        dato.fono || "",                    // Q: Fono
        dato.fechaInicioMes || "",          // R: Fecha Ini
        dato.fechaFinMes || "",             // S: Fecha Fin
        dato.jefaturaNombre || "",          // T: Jefatura
        dato.jefaturaCargo || "",           // U: Cargo Jefatura
        dato.jefaturaDireccion || ""        // V: Dirección Jefatura
      ]);
      resultados.push({ rut: rutGuardar, estado: "SIN GENERAR", mensaje: "Inicializado para procesar" });
      
      // Agregamos al mapa temporal por si hay duplicados en el mismo lote
      mapaExistentes[key] = true;
    }
  });

  // Escritura Atómica con Bloqueo Corto
  if (nuevasFilas.length > 0) {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(15000); 
        sheet.getRange(sheet.getLastRow() + 1, 1, nuevasFilas.length, headers.length).setValues(nuevasFilas);
    } catch(e: any) {
        throw new Error("El sistema está muy ocupado inicializando filas. Intente de nuevo en 1 minuto.");
    } finally {
        lock.releaseLock();
    }
  }

  return resultados;
}

/**
 * 3. PROCESAMIENTO PARALELO (CORE BATCH)
 * Esta función es llamada de forma concurrente por múltiples workers.
 * Delega la generación del PDF directo a Drive en Cloud Run.
 */
function procesarItemIndividualLote(dato: any): any {
  if (!dato.rut || !dato.nombre) return { exito: false, error: "Datos incompletos." };

  const nombrePdfLimpio = `${dato.nombre}.pdf`;
  const fechaActual = new Date();
  const fechaFirma = Utilities.formatDate(fechaActual, CONFIG.TIMEZONE, "dd/MM/yyyy");

  dato.rut = formatearRutParaBD(dato.rut);

  try {
    const metaData = obtenerMetadataSegura(dato.rut);
    const carpetas = crearEstructuraCarpetas(dato, metaData, dato.mesSeleccionado, dato.anio);
    const archivoPlantilla = DriveApp.getFileById(CONFIG.ID_PLANTILLA);

    const linksGenerados = retryOperationMasivo(() => {
        // A. Generar Word Remuneraciones
        const copyRemu = archivoPlantilla.makeCopy(dato.nombre, carpetas.docs);
        const docRemu = DocumentApp.openById(copyRemu.getId());
        llenarPlantilla(docRemu.getBody(), dato, dato.mesSeleccionado, dato.anio, fechaFirma, true);
        docRemu.saveAndClose(); 
        
        // B. Generar Word Transparencia (copia censurada)
        const copyTransp = archivoPlantilla.makeCopy("TEMP_TRANSP_" + dato.nombre, carpetas.docs);
        const docTransp = DocumentApp.openById(copyTransp.getId());
        const bodyTransp = docTransp.getBody();
        llenarPlantilla(bodyTransp, dato, dato.mesSeleccionado, dato.anio, fechaFirma, false);
        censurarDatos(bodyTransp, [
            dato.rut, 
            dato.fono || "", 
            dato.correo || "", 
            dato.nacimiento || ""
        ]); 
        docTransp.saveAndClose();
        
        // C. Exportar a PDF directamente en Google Drive vía Cloud Run
        const resCloud = llamarCloudPDF(
            copyRemu.getId(), 
            copyTransp.getId(), 
            carpetas.generados.getId(), 
            carpetas.transp.getId(), 
            nombrePdfLimpio
        );
        
        // Borrar archivo temporal de transparencia
        DriveApp.getFileById(copyTransp.getId()).setTrashed(true);

        return {
            remuUrl: resCloud.urlRemu,
            transpUrl: resCloud.urlTransp,
            docsUrl: copyRemu.getUrl()
        };
    }, 3);

    const resultadoEscritura = guardarLinksConBloqueoOptimizado(dato, linksGenerados);
    
    if (!resultadoEscritura.exito) {
        return { 
            exito: false, 
            error: "PDFs creados pero falló guardado: " + resultadoEscritura.error,
            linksRecuperacion: linksGenerados 
        };
    }

    return { 
        exito: true, 
        links: { remu: linksGenerados.remuUrl, transp: linksGenerados.transpUrl, docs: linksGenerados.docsUrl } 
    };

  } catch (e: any) {
    console.error("Error FATAL Rut " + dato.rut + ": " + e.toString());
    try { reportarErrorLote(dato.rut, dato.mesSeleccionado, dato.anio, e.toString()); } catch(err){}
    return { exito: false, error: e.toString() };
  }
}

/**
 * 4. ESCRITURA ATÓMICA ULTRA-RÁPIDA (CON BLOQUEO DELGADO)
 * Ejecuta la búsqueda del RUT y ubicaciones ANTES de adquirir el Script Lock.
 */
function guardarLinksConBloqueoOptimizado(dato: any, links: any): any {
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    const sheet = ss.getSheetByName(CONFIG.TAB_LOG);
    if (!sheet) return { exito: false, error: "Hoja de logs no encontrada." };
    
    let rutBusqueda = formatearRutParaBD(dato.rut);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { exito: false, error: "Hoja vacía." };

    // --- OPERACIÓN DE BÚSQUEDA FUERA DEL BLOQUEO ---
    console.log("🔍 [Masivo] Buscando fila para RUT: " + rutBusqueda + " (Mes: " + dato.mesSeleccionado + ", Año: " + dato.anio + ")");
    
    // Buscamos el RUT canonical en la columna D
    const buscador = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutBusqueda);
    const ocurrencias = buscador.findAll();
    
    let filaIndex = -1;
    
    for (let i = ocurrencias.length - 1; i >= 0; i--) {
        let row = ocurrencias[i].getRow();
        let checkData = sheet.getRange(row, 2, 1, 2).getValues()[0]; // Mes y Año
        
        // Comparación estricta
        if (String(checkData[0]).toUpperCase().trim() === String(dato.mesSeleccionado).toUpperCase().trim() && 
            String(checkData[1]).trim() == String(dato.anio).trim()) {
            filaIndex = row;
            break;
        }
    }

    if (filaIndex === -1) {
        console.warn("⚠️ [Masivo] No se encontró coincidencia para RUT: " + rutBusqueda);
        return { exito: false, error: "No se encontró fila para RUT: " + rutBusqueda };
    }

    console.log("✅ [Masivo] Fila encontrada: " + filaIndex + " para RUT: " + rutBusqueda + ". Adquiriendo bloqueo de escritura...");

    // Adquirir bloqueo corto
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(15000); // Esperar máximo 15 segundos
        
        // Escritura
        const datosLinks = [["GENERADO", links.docsUrl, links.remuUrl, links.transpUrl]];
        sheet.getRange(filaIndex, 6, 1, 4).setValues(datosLinks);
        
        if (dato.correo || dato.fono) {
            const datosContacto = [[dato.correo, dato.fono]];
            sheet.getRange(filaIndex, 16, 1, 2).setValues(datosContacto);
        }

        return { exito: true };

    } catch (e: any) {
        return { exito: false, error: "Error escritura: " + e.toString() };
    } finally {
        lock.releaseLock();
    }
}

/**
 * UTILIDAD: Reintentos con Backoff Exponencial para Drive/Docs API
 */
function retryOperationMasivo(operation: () => any, maxRetries: number): any {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return operation();
        } catch (e: any) {
            lastError = e;
            console.warn(`Intento ${i + 1} fallido de procesamiento masivo. Reintentando...`);
            if (i < maxRetries - 1) {
                // Espera exponencial estándar: 1s, 2s, 4s...
                const delay = 1000 * Math.pow(2, i);
                Utilities.sleep(delay); 
            }
        }
    }
    throw lastError;
}

/**
 * UTILIDAD: Reporte de errores en la hoja sin bloquear el flujo principal
 */
function reportarErrorLote(rut: any, mes: any, anio: any, errorMsg: string): void {
    try {
        const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
        const sheet = ss.getSheetByName(CONFIG.TAB_LOG);
        if (!sheet) return;
        
        const buscador = sheet.getRange("D:D").createTextFinder(String(rut));
        const ocurrencia = buscador.findNext();
        if (ocurrencia) {
            sheet.getRange(ocurrencia.getRow(), 6).setValue("ERROR: " + errorMsg.substring(0, 50));
        }
    } catch(e) {
        console.error("No se pudo loguear el error en la hoja de cálculo: " + e);
    }
}
