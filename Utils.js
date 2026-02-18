// ==========================================
// UTILS / HELPERS GENERALES
// ==========================================

function llenarPlantilla(body, d, mes, anio, fechaFirma, incluirContacto) {
  body.replaceText('{{Nombre}}', d.nombre || " ");
  body.replaceText('{{Rut}}', d.rut || " ");
  body.replaceText('{{Direccion}}', d.direccion || " "); 
  body.replaceText('{{Programa}}', d.programa || " ");
  body.replaceText('{{funcion}}', d.funcion || " "); 
  body.replaceText('{{fecha}}', d.nacimiento || " "); 
  
  body.replaceText('{{Jefatura}}', d.jefaturaNombre || " ");
  body.replaceText('{{Cargo}}', d.jefaturaCargo || " ");            
  body.replaceText('{{DirJefatura}}', d.jefaturaDireccion || " "); 
  
  body.replaceText('{{mes}}', mes || " ");
  body.replaceText('{{Mes}}', mes || " "); 
  body.replaceText('{{anio}}', anio || " "); 
  body.replaceText('{{periodoMes}}', d.fechaInicioMes || " ");
  body.replaceText('{{periodoFinMes}}', d.fechaFinMes || " ");
  body.replaceText('{{informe_glosa}}', d.actividades || " ");
  body.replaceText('{{Dificultades_glosa}}', d.dificultades || " ");
  body.replaceText('{{LICENCIA}}', d.datoLicencia || "NO PRESENTA"); 
  body.replaceText('{{ENFERMEDAD}}', d.datoEnfermedad || "NO PRESENTA");
  body.replaceText('{{VACACIONES}}', d.datoVacaciones || "NO PRESENTA");

  if (incluirContacto) {
      body.replaceText('{{FONO}}', d.fono || "");
      body.replaceText('{{CORREO}}', d.correo || "");
  } else {
      body.replaceText('{{FONO}}', "");
      body.replaceText('{{CORREO}}', "");
  }
}

function censurarDatos(body, textosACensurar) {
  textosACensurar.forEach(texto => {
    if (!texto || texto.trim() === "") return;
    let foundElement = body.findText(texto);
    while (foundElement) {
      let elem = foundElement.getElement();
      if (elem.editAsText) {
        let textObj = elem.editAsText();
        let start = foundElement.getStartOffset();
        let end = foundElement.getEndOffsetInclusive();
        let length = end - start + 1;
        let replacement = "X".repeat(length);
        
        // REEMPLAZO REAL DE CARACTERES (SEGURIDAD)
        textObj.deleteText(start, end);
        textObj.insertText(start, replacement);
        
        // ESTÉTICA: FONDO NEGRO SOBRE TEXTO
        textObj.setBackgroundColor(start, start + length - 1, "#000000"); 
        textObj.setForegroundColor(start, start + length - 1, "#000000"); 
      }
      foundElement = body.findText(texto, foundElement); // Buscar siguiente ocurrencia
    }
  });
}

function obtenerRangoFechas(nombreMes, anio) {
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const mesIndex = meses.indexOf(nombreMes);
  const primerDia = new Date(anio, mesIndex, 1);
  const ultimoDia = new Date(anio, mesIndex + 1, 0);
  return { inicio: Utilities.formatDate(primerDia, CONFIG.TIMEZONE, "dd/MM/yyyy"), fin: Utilities.formatDate(ultimoDia, CONFIG.TIMEZONE, "dd/MM/yyyy") };
}

function buscarOCrearCarpeta(parent, name) {
  try {
      const folders = parent.getFoldersByName(name);
      if (folders.hasNext()) return folders.next();
      return parent.createFolder(name);
  } catch(e) {
      throw new Error("Error accediendo a carpeta '" + name + "'. Verifique permisos o existencia.");
  }
}

function crearEstructuraCarpetas(datos, metaData, mesProceso, anioProceso) {
    const nombreCarpetaMes = `${anioProceso} ${mesProceso}`;
    
    // Usamos la dirección que viene del formulario (que ya se actualizó con el jefe)
    // OJO: datos.direccion es lo que está en el input "inputDirJefatura" o "direccion"
    let rutaString = datos.direccion || metaData.direccion || "SIN DIRECCION";
    
    // Limpieza inicial
    rutaString = String(rutaString).trim();

    // Función recursiva para anidar carpetas
    function getJerarquia(rootID) {
        const root = DriveApp.getFolderById(rootID);
        
        // 1. Entrar/Crear carpeta AÑO MES
        let currentFolder = buscarOCrearCarpeta(root, nombreCarpetaMes);
        
        // 2. Desglosar la ruta "A / B / C"
        // El separador que usamos en el autocompletado es " / "
        const partes = rutaString.split(" / ");

        // 3. Iterar creando carpetas anidadas
        partes.forEach(parte => {
            let nombreLimpio = parte.trim();
            // Ignorar partes vacías o guiones solos
            if (nombreLimpio && nombreLimpio !== "-" && nombreLimpio !== "0") {
                currentFolder = buscarOCrearCarpeta(currentFolder, nombreLimpio);
            }
        });
        
        return currentFolder; 
    }

    function getTransparenciaFolder() {
        const rootTransp = DriveApp.getFolderById(CONFIG.ID_FOLDER_TRANSPARENCIA);
        const fMesTransp = buscarOCrearCarpeta(rootTransp, nombreCarpetaMes);
        let letraInicial = datos.nombre.charAt(0).toUpperCase();
        if(!letraInicial.match(/[A-Z]/)) letraInicial = "#";
        const folderLetra = buscarOCrearCarpeta(fMesTransp, letraInicial);
        return folderLetra; 
    }

    return {
        docs: getJerarquia(CONFIG.ID_FOLDER_DOCS),
        generados: getJerarquia(CONFIG.ID_FOLDER_PDFS_GENERADOS),
        remu: getJerarquia(CONFIG.ID_FOLDER_REMU), 
        transp: getTransparenciaFolder()
    };
}

// ==========================================
// REGISTRO EN LOG (SHEETS)
// ==========================================

function registrarEnLog(data) {
  const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
  let sheet = ss.getSheetByName(CONFIG.TAB_LOG);
  
  // Headers alineados (22 columnas)
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

  const timestamp = new Date();
  const linkRespaldoFinal = data.linkRespaldo || "AUN SIN ADJUNTAR";
  const rutInput = String(data.rut).replace(/\./g, '').replace(/-/g, '').trim();
  
  const datosExistentes = sheet.getDataRange().getValues();
  let filaEncontrada = -1;

  for (let i = datosExistentes.length - 1; i >= 1; i--) {
      let rowRut = String(datosExistentes[i][3]).replace(/\./g, '').replace(/-/g, '').trim();
      let rowMes = String(datosExistentes[i][1]).trim();
      let rowAnio = String(datosExistentes[i][2]).trim();
      
      if (rowRut === rutInput && rowMes === data.mes && rowAnio == data.anio) {
          filaEncontrada = i + 1;
          break;
      }
  }

  // --- CORRECCIÓN AQUÍ ---
  // Aceptamos cualquier valor que venga del frontend en 'licenciasTexto'.
  let valorLicencia = data.licenciasTexto || data.licencias || "NO PRESENTA"; 

  if (filaEncontrada > 0) {
      // ACTUALIZAR (Indices ajustados)
      sheet.getRange(filaEncontrada, 1).setValue(timestamp);          // A
      sheet.getRange(filaEncontrada, 6).setValue(data.estado);        // F
      
      if (data.linkDocs && data.linkDocs !== "---") sheet.getRange(filaEncontrada, 7).setValue(data.linkDocs); // G
      if (data.linkRemu && data.linkRemu !== "---") sheet.getRange(filaEncontrada, 8).setValue(data.linkRemu); // H
      if (data.linkTransp && data.linkTransp !== "---") sheet.getRange(filaEncontrada, 9).setValue(data.linkTransp); // I
      if (data.linkRespaldo && data.linkRespaldo !== "---") sheet.getRange(filaEncontrada, 10).setValue(linkRespaldoFinal); // J
      
      if (data.actividades && data.actividades !== "---") sheet.getRange(filaEncontrada, 11).setValue(data.actividades); // K
      if (data.funcion) sheet.getRange(filaEncontrada, 12).setValue(data.funcion); // L
      
      sheet.getRange(filaEncontrada, 14).setValue(valorLicencia);     // N (Ahora guarda el valor real)
      if (data.periodos && data.periodos !== "---") sheet.getRange(filaEncontrada, 15).setValue(data.periodos); // O
      
      if (data.correo) sheet.getRange(filaEncontrada, 16).setValue(data.correo); // P
      if (data.fono) sheet.getRange(filaEncontrada, 17).setValue(data.fono);     // Q
      
      if (data.fechaInicio) sheet.getRange(filaEncontrada, 18).setValue(data.fechaInicio); // R
      if (data.fechaFin) sheet.getRange(filaEncontrada, 19).setValue(data.fechaFin);        // S

      if (data.jefaturaNombre) sheet.getRange(filaEncontrada, 20).setValue(data.jefaturaNombre); // T
      if (data.jefaturaCargo) sheet.getRange(filaEncontrada, 21).setValue(data.jefaturaCargo);   // U
      if (data.direccion) sheet.getRange(filaEncontrada, 22).setValue(data.direccion);           // V

  } else {
      // NUEVA FILA (Orden estricto)
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
        valorLicencia,          // N (Ahora guarda el valor real)
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
}

