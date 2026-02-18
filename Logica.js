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
  // ... (Inicio igual: fechas, verificación rápida) ...
  const fechaActual = new Date();
  let mesProceso = datos.mesSeleccionado;
  let anioProceso = fechaActual.getFullYear();
  if (mesProceso === "Diciembre" && fechaActual.getMonth() === 0) anioProceso = anioProceso - 1;
  
  const duplicadoCheck = verificarExistenciaRapida(datos.rut, mesProceso, anioProceso);
  if (duplicadoCheck.existe && (duplicadoCheck.estado.includes("FINALIZADO") || (duplicadoCheck.linkRespaldo && duplicadoCheck.linkRespaldo.length > 15))) {
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
        // Doc Privado
        const copyRemu = archivoPlantilla.makeCopy(datos.nombre, carpetas.docs);
        const docRemu = DocumentApp.openById(copyRemu.getId());
        llenarPlantilla(docRemu.getBody(), datos, mesProceso, anioProceso, fechaFirma, true);
        docRemu.saveAndClose();
        const blobRemu = copyRemu.getAs('application/pdf').setName(nombrePdfLimpio);
        const pdfRemu = carpetas.generados.createFile(blobRemu);

        // Doc Público (Censurado)
        const copyTransp = archivoPlantilla.makeCopy("TEMP_" + datos.nombre, carpetas.docs);
        const docTransp = DocumentApp.openById(copyTransp.getId());
        const bodyTransp = docTransp.getBody();
        llenarPlantilla(bodyTransp, datos, mesProceso, anioProceso, fechaFirma, false);
        censurarDatos(bodyTransp, [datos.rut, datos.nacimiento]); 
        docTransp.saveAndClose();
        const pdfTransp = carpetas.transp.createFile(copyTransp.getAs('application/pdf').setName(nombrePdfLimpio));
        copyTransp.setTrashed(true);

        return { remu: pdfRemu.getUrl(), transp: pdfTransp.getUrl(), docs: copyRemu.getUrl() };
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
      jefaturaNombre: datos.jefaturaNombre || "", jefaturaCargo: datos.jefaturaCargo || ""
    };

    const resultadoLog = registrarEnLogOptimizado(datosLog);
    if (!resultadoLog.exito) console.error("Fallo Log: " + resultadoLog.error);

    return { exito: true, urlRemu: linksGenerados.remu, urlTransp: linksGenerados.transp };

  } catch (e) { return { exito: false, error: "Error: " + e.toString() }; }
}
/**
 * 2. GUARDAR ARCHIVO FIRMADO (SUBIDA FINAL)
 * También optimizado con bloqueo corto.
 */
function guardarArchivoFirmado(datos) {
  const lock = LockService.getScriptLock();
  try {
      // Esperamos turno para escribir (30s es suficiente si la escritura es rápida)
      lock.waitLock(30000);

      const fechaActual = new Date();
      let mesProceso = datos.mes; 
      let anioProceso = fechaActual.getFullYear();
      if(mesProceso === "Diciembre" && fechaActual.getMonth() === 0) anioProceso = anioProceso - 1;

      // Verificación rápida antes de subir
      const duplicado = verificarExistenciaRapida(datos.rut, mesProceso, anioProceso);
      if (duplicado.existe && duplicado.estado.includes("FINALIZADO")) {
          throw new Error("Este periodo ya fue cerrado y finalizado correctamente.");
      }

      // 1. Guardar Archivo Físico (Sin bloqueo de hoja necesario, pero está dentro del try)
      const metaData = obtenerMetadataSegura(datos.rut);
      const struct = crearEstructuraCarpetas(datos, metaData, mesProceso, anioProceso);
      
      const decoded = Utilities.base64Decode(datos.bytes);
      let extension = "pdf";
      if(datos.mimeType.includes("jpeg") || datos.mimeType.includes("jpg")) extension = "jpg";
      if(datos.mimeType.includes("png")) extension = "png";
      
      const blob = Utilities.newBlob(decoded, datos.mimeType, `${datos.nombre}.${extension}`);
      const fileEscaneado = struct.remu.createFile(blob); 

      // 2. Actualizar Hoja (Operación crítica)
      const datosFinales = {
        mes: mesProceso, anio: anioProceso, rut: datos.rut, nombre: datos.nombre,
        estado: "FINALIZADO (OK)", 
        linkRemu: duplicado.linkRemu || "---", 
        linkTransp: duplicado.linkTransp || "---",
        linkDocs: duplicado.linkDocs || "---", 
        linkRespaldo: fileEscaneado.getUrl(), // El link nuevo
        actividades: "---", // No sobreescribimos actividades grandes para ahorrar tiempo
        licencias: duplicado.licencias || "---",
        periodos: duplicado.periodos || "---",
        // Mantenemos datos previos
        fechaInicio: duplicado.fechaInicio, fechaFin: duplicado.fechaFin,
        fono: duplicado.fono, correo: duplicado.correo
      };
      
      // Usamos la versión optimizada de registro
      registrarEnLogOptimizado(datosFinales);

      return { exito: true };

  } catch(e) {
      throw new Error(e.toString());
  } finally {
      lock.releaseLock();
  }
}

/**
 * 3. REGISTRO EN LOG OPTIMIZADO (TEXTFINDER)
 * Reemplaza al antiguo 'registrarEnLog' que usaba bucles lentos.
 */
function registrarEnLogOptimizado(data) {
  const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
  let sheet = ss.getSheetByName(CONFIG.TAB_LOG);
  
  if (!sheet) {
    // Si no existe, usamos la función vieja para crearla (sucede 1 vez)
    return registrarEnLogLegacy(data); 
  }

  // --- BÚSQUEDA RÁPIDA (TextFinder) ---
  const rutClean = String(data.rut).replace(/^0+/, '').replace(/\./g, '').replace(/-/g, '').trim();
  const lastRow = sheet.getLastRow();
  
  // Buscar en columna D (RUT)
  let filaEncontrada = -1;
  
  if (lastRow > 1) {
    const buscador = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutClean);
    const ocurrencias = buscador.findAll();
    
    // Buscar coincidencia exacta de MES y AÑO (hacia atrás)
    for (let i = ocurrencias.length - 1; i >= 0; i--) {
        let row = ocurrencias[i].getRow();
        // Leemos solo Mes (Col 2) y Año (Col 3)
        let checkData = sheet.getRange(row, 2, 1, 2).getValues()[0]; 
        if (String(checkData[0]) === data.mes && String(checkData[1]) == data.anio) {
            filaEncontrada = row;
            break;
        }
    }
  }

  const timestamp = new Date();
  const linkRespaldoFinal = data.linkRespaldo || "AUN SIN ADJUNTAR";
  const valorLicencia = data.licencias || "NO PRESENTA";

  const lock = LockService.getScriptLock();
  try {
      lock.waitLock(15000); // Espera max 15s para escribir

      if (filaEncontrada > 0) {
          // ACTUALIZAR FILA EXISTENTE (Solo celdas clave para ir rápido)
          // Preparamos arrays para setValues (más rápido que setValue individual)
          
          // Grupo 1: Estado y Links (Col 6, 7, 8, 9, 10)
          const rangeLinks = sheet.getRange(filaEncontrada, 6, 1, 5);
          const valoresLinks = [[
              data.estado,
              data.linkDocs || "---",
              data.linkRemu || "---",
              data.linkTransp || "---",
              linkRespaldoFinal
          ]];
          rangeLinks.setValues(valoresLinks);
          
          // Actualizamos timestamp (Col 1)
          sheet.getRange(filaEncontrada, 1).setValue(timestamp);

          // Si vienen actividades nuevas (fase 1), actualizamos
          if (data.actividades && data.actividades !== "---") {
             sheet.getRange(filaEncontrada, 11).setValue(data.actividades);
             sheet.getRange(filaEncontrada, 14).setValue(valorLicencia);
             if (data.periodos) sheet.getRange(filaEncontrada, 15).setValue(data.periodos);
             if (data.fechaInicio) sheet.getRange(filaEncontrada, 18).setValue(data.fechaInicio);
             if (data.fechaFin) sheet.getRange(filaEncontrada, 19).setValue(data.fechaFin);
          }
          
          // Contacto (si existe)
          if (data.correo) sheet.getRange(filaEncontrada, 16).setValue(data.correo);
          if (data.fono) sheet.getRange(filaEncontrada, 17).setValue(data.fono);

      } else {
          // CREAR NUEVA FILA
          sheet.appendRow([
            timestamp,              // A
            data.mes,               // B
            data.anio,              // C
            data.rut,               // D
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

  } catch(e) {
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

  const rutClean = String(rut).replace(/^0+/, '').replace(/\./g, '').replace(/-/g, '').trim();
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return { existe: false };

  // TextFinder es mucho más rápido que iterar arrays en JS
  const buscador = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutClean);
  const ocurrencias = buscador.findAll();
  
  for (let i = ocurrencias.length - 1; i >= 0; i--) {
      let row = ocurrencias[i].getRow();
      // Leemos fila completa de una sola vez para tener todos los datos
      // Optimizamos leyendo solo hasta la columna P (Correo) que es lo que necesitamos
      let dataRow = sheet.getRange(row, 1, 1, 16).getValues()[0];
      
      let rowMes = String(dataRow[1]); // Col B
      let rowAnio = String(dataRow[2]); // Col C
      
      if (rowMes === mes && rowAnio == anio) {
          return { 
             existe: true, 
             estado: dataRow[5], // Col F
             linkDocs: dataRow[6],
             linkRemu: dataRow[7],
             linkTransp: dataRow[8],
             linkRespaldo: dataRow[9],
             actividades: dataRow[10],
             licencias: dataRow[13],
             periodos: dataRow[14],
             correo: dataRow[15]
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
            Utilities.sleep(1000 * (i + 1)); 
        }
    }
}

/**
 * 5. ENVIAR REPORTE CORREO (Sin cambios, solo se incluye para que no falte)
 */
function enviarReporteProblema(datos) {
    try {
        const destinatario = "renato.alvarez@municoquimbo.cl";
        const asunto = `[SOPORTE HONORARIOS] Reporte de ${datos.nombre}`;
        const cuerpo = `
            Estimado Renato,
            
            El funcionario ${datos.nombre} (RUT: ${datos.rut}) ha reportado el siguiente problema:
            
            ------------------------------------------------
            MENSAJE DEL USUARIO:
            ${datos.mensaje}
            ------------------------------------------------
            
            Fono: ${datos.fono}
            Correo: ${datos.correo}
        `;
        
        MailApp.sendEmail(destinatario, asunto, cuerpo);
        return { exito: true };
    } catch (e) {
        return { exito: false, error: e.toString() };
    }
}