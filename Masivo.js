/**
 * ==========================================================================
 * BACKEND ROBUSTO - GESTIÓN DE INFORMES MASIVOS
 * Optimizada para concurrencia con Google Workspace Enterprise
 * ==========================================================================
 */

/**
 * 1. INICIALIZACIÓN DE LOTE (Escritura Atómica)
 * Crea los espacios en la hoja "SIN GENERAR" para reservar el lugar.
 */

function formatearRutParaBD(rut) {
  if (!rut) return "";
  // 1. Limpiar todo lo que no sea número o K
  let limpio = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  
  if (limpio.length < 2) return rut; // Retornar tal cual si es basura
  
  let dv = limpio.slice(-1);
  let cuerpo = limpio.slice(0, -1);
  
  // 2. Rellenar con 0 a la izquierda hasta tener 8 dígitos de cuerpo
  // Esto asegura que 9 millones quede como 09
  while (cuerpo.length < 8) {
    cuerpo = "0" + cuerpo;
  }
  
  return cuerpo + "-" + dv;
}

function inicializarLoteEnSheet(listaDatos) {
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
  let mapaExistentes = {};

  if (ultimaFila > 1) {
    // sheet.getRange(row, col, numRows, numCols) -> Col 2(Mes), 3(Año), 4(Rut)
    const datosClave = sheet.getRange(2, 2, ultimaFila - 1, 3).getValues(); 
    
    for(let i=0; i<datosClave.length; i++) {
        // Normalizamos lo que ya existe en la hoja para comparar peras con peras
        // Limpiamos todo a: 09222054K (sin guion para la clave del mapa, más seguro)
        let rRaw = String(datosClave[i][2]);
        let rKey = rRaw.replace(/[^0-9kK]/g, '').toUpperCase(); 
        
        let mesKey = String(datosClave[i][0]).toUpperCase().trim();
        let anioKey = String(datosClave[i][1]).trim();
        
        let key = rKey + "_" + mesKey + "_" + anioKey;
        mapaExistentes[key] = true; 
    }
  }

  const timestamp = new Date();
  const nuevasFilas = [];
  const resultados = [];
  
  listaDatos.forEach(dato => {
    // 1. Normalizamos el RUT de entrada para generar la clave de búsqueda
    let rutInputClean = String(dato.rut).replace(/[^0-9kK]/g, '').toUpperCase();
    let mesInput = String(dato.mesSeleccionado).toUpperCase().trim();
    let anioInput = String(dato.anio).trim();
    
    let key = rutInputClean + "_" + mesInput + "_" + anioInput;
    
    // 2. Generamos el RUT visual para guardar (Formato 09222054-0)
    let rutGuardar = formatearRutParaBD(dato.rut);

    if (mapaExistentes[key]) {
      resultados.push({ rut: rutGuardar, estado: "SIN GENERAR", mensaje: "Ya existe registro (Omitido)" });
    } else {
      nuevasFilas.push([
        timestamp,                          // A: Timestamp
        dato.mesSeleccionado,               // B: Mes
        dato.anio,                          // C: Año
        rutGuardar,                         // D: Rut (FORMATO CORREGIDO)
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
      
      // Agregamos al mapa temporal por si hay duplicados en el mismo lote que se está subiendo
      mapaExistentes[key] = true;
    }
  });

  // Escritura Atómica con Bloqueo Corto
  if (nuevasFilas.length > 0) {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000); 
        sheet.getRange(sheet.getLastRow() + 1, 1, nuevasFilas.length, headers.length).setValues(nuevasFilas);
    } catch(e) {
        throw new Error("El sistema está muy ocupado inicializando filas. Intente de nuevo en 1 minuto.");
    } finally {
        lock.releaseLock();
    }
  }

  return resultados;
}


/**
 * 2. PROCESAMIENTO PARALELO (CORE)
 * Esta función es llamada por múltiples usuarios simultáneamente.
 * SEPARA la generación (Lenta/Paralela) del guardado (Rápido/Serial).
 */
function procesarItemIndividualLote(dato) {
  if (!dato.rut || !dato.nombre) return { exito: false, error: "Datos incompletos." };

  // Corrección: Asegurar que usamos el nombre limpio para el archivo
  const nombrePdfLimpio = `${dato.nombre}.pdf`;
  const fechaActual = new Date();
  const fechaFirma = Utilities.formatDate(fechaActual, CONFIG.TIMEZONE, "dd/MM/yyyy");

  // Corrección: Formatear RUT visual para el documento
  dato.rut = formatearRutParaBD(dato.rut);

  try {
    const metaData = obtenerMetadataSegura(dato.rut);
    const carpetas = crearEstructuraCarpetas(dato, metaData, dato.mesSeleccionado, dato.anio);
    const archivoPlantilla = DriveApp.getFileById(CONFIG.ID_PLANTILLA);

    const linksGenerados = retryOperation(() => {
        // A. Generar Word y PDF Remuneraciones
        const copyRemu = archivoPlantilla.makeCopy(dato.nombre, carpetas.docs);
        const docRemu = DocumentApp.openById(copyRemu.getId());
        llenarPlantilla(docRemu.getBody(), dato, dato.mesSeleccionado, dato.anio, fechaFirma, true);
        docRemu.saveAndClose(); 
        
        const blobRemu = copyRemu.getAs('application/pdf').setName(nombrePdfLimpio);
        const pdfRemu = carpetas.generados.createFile(blobRemu);

        // B. Generar PDF Transparencia
        const copyTransp = archivoPlantilla.makeCopy("TEMP_TRANSP_" + dato.nombre, carpetas.docs);
        const docTransp = DocumentApp.openById(copyTransp.getId());
        const bodyTransp = docTransp.getBody();
        llenarPlantilla(bodyTransp, dato, dato.mesSeleccionado, dato.anio, fechaFirma, false);
        censurarDatos(bodyTransp, [dato.rut, dato.nacimiento]); 
        docTransp.saveAndClose();
        
        const pdfTransp = carpetas.transp.createFile(copyTransp.getAs('application/pdf').setName(nombrePdfLimpio));
        copyTransp.setTrashed(true);

        return {
            remuUrl: pdfRemu.getUrl(),
            transpUrl: pdfTransp.getUrl(),
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

  } catch (e) {
    console.error("Error FATAL Rut " + dato.rut + ": " + e.toString());
    try { reportarErrorLote(dato.rut, dato.mesSeleccionado, dato.anio, e.toString()); } catch(err){}
    return { exito: false, error: e.toString() };
  }
}

/**
 * 3. ESCRITURA ATÓMICA ULTRA-RÁPIDA
 * Usa TextFinder para saltar directamente a la celda sin iterar arrays.
 */
function guardarLinksConBloqueoOptimizado(dato, links) {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(45000); 
        
        const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
        const sheet = ss.getSheetByName(CONFIG.TAB_LOG);
        
        // --- LOG DE BÚSQUEDA ---
        let rutBusqueda = formatearRutParaBD(dato.rut);
        console.log("🔍 [Masivo] Buscando fila para RUT: " + rutBusqueda + " (Mes: " + dato.mesSeleccionado + ", Año: " + dato.anio + ") en REGISTRO_HISTORICO");
        
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return { exito: false, error: "Hoja vacía." };

        // Buscamos el RUT formateado (ej: "09222054-0") en la columna D
        const buscador = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutBusqueda);
        const ocurrencias = buscador.findAll();
        
        let filaIndex = -1;
        
        for (let i = ocurrencias.length - 1; i >= 0; i--) {
            let row = ocurrencias[i].getRow();
            let checkData = sheet.getRange(row, 2, 1, 2).getValues()[0]; // Mes y Año
            
            // Comparación estricta de Mes y Año
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

        console.log("✅ [Masivo] Fila encontrada: " + filaIndex + " para RUT: " + rutBusqueda);

        // Escritura
        const datosLinks = [["GENERADO", links.docsUrl, links.remuUrl, links.transpUrl]];
        sheet.getRange(filaIndex, 6, 1, 4).setValues(datosLinks);
        
        if(dato.correo || dato.fono) {
            const datosContacto = [[dato.correo, dato.fono]];
            sheet.getRange(filaIndex, 16, 1, 2).setValues(datosContacto);
        }

        return { exito: true };

    } catch (e) {
        return { exito: false, error: "Error escritura: " + e.toString() };
    } finally {
        lock.releaseLock();
    }
}

/**
 * UTILIDAD: Reintentos para llamadas inestables (Drive API)
 */
function retryOperation(operation, maxRetries) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return operation();
        } catch (e) {
            lastError = e;
            console.warn(`Intento ${i + 1} fallido: ${e.toString()}`);
            if (i < maxRetries - 1) {
                // Espera exponencial: 1s, 2s, 4s...
                Utilities.sleep(1000 * Math.pow(2, i)); 
            }
        }
    }
    throw lastError;
}

/**
 * UTILIDAD: Reporte de errores en la hoja sin bloquear flujo principal
 */
function reportarErrorLote(rut, mes, anio, errorMsg) {
    try {
        const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
        const sheet = ss.getSheetByName(CONFIG.TAB_LOG);
        // Búsqueda simplificada para error logging
        const buscador = sheet.getRange("D:D").createTextFinder(String(rut));
        const ocurrencia = buscador.findNext();
        if(ocurrencia) {
            sheet.getRange(ocurrencia.getRow(), 6).setValue("ERROR: " + errorMsg.substring(0, 50));
        }
    } catch(e) {
        console.error("No se pudo loguear el error en sheet: " + e);
    }
}