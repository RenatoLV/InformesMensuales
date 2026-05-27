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

/**
 * Escapa caracteres especiales de expresión regular en un texto.
 * body.findText() de Google Docs interpreta el patrón como regex,
 * por lo que teléfonos con '+', paréntesis, etc. rompen la búsqueda.
 */
function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function censurarDatos(body, textosACensurar) {
  textosACensurar.forEach(texto => {
    if (!texto || texto.trim() === "") return;
    // ⚠️ CRÍTICO: findText usa regex → escapar caracteres especiales (+, ., *, (, ), etc.)
    const patron = escaparRegex(texto);
    let foundElement = body.findText(patron);
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
      foundElement = body.findText(patron, foundElement); // Buscar siguiente ocurrencia
    }
  });
}

function obtenerRangoFechas(nombreMes, anio) {
  const meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  const mesIndex = meses.indexOf(String(nombreMes).toUpperCase().trim());
  if (mesIndex === -1) {
    console.error("⚠️ [Utils] Mes no reconocido: '" + nombreMes + "'. Usando mes actual como fallback.");
    const fallback = new Date();
    const primerDia = new Date(fallback.getFullYear(), fallback.getMonth(), 1);
    const ultimoDia = new Date(fallback.getFullYear(), fallback.getMonth() + 1, 0);
    return { inicio: Utilities.formatDate(primerDia, CONFIG.TIMEZONE, "dd/MM/yyyy"), fin: Utilities.formatDate(ultimoDia, CONFIG.TIMEZONE, "dd/MM/yyyy") };
  }
  const primerDia = new Date(anio, mesIndex, 1);
  const ultimoDia = new Date(anio, mesIndex + 1, 0);
  return { inicio: Utilities.formatDate(primerDia, CONFIG.TIMEZONE, "dd/MM/yyyy"), fin: Utilities.formatDate(ultimoDia, CONFIG.TIMEZONE, "dd/MM/yyyy") };
}

/**
 * NORMALIZACIÓN CANÓNICA DE RUT
 * Fuente única de verdad para comparar RUTs en todo el proyecto.
 * Entrada: cualquier formato ("21.816.027-1", "218160271", "9222054-0", "092220540")
 * Salida: "21816027-1" or "09222054-0" (cuerpo 8 dígitos con ceros iniciales + guión + DV)
 */
function normalizarRutCanonical(rut) {
  if (!rut) return "";

  // 1. Limpieza inicial
  let limpio = String(rut).replace(/[\.\s]/g, '').toUpperCase();

  let cuerpo = "";
  let dv = "";

  // 2. Extraer cuerpo y DV
  if (limpio.includes('-')) {
    let partes = limpio.split('-');
    cuerpo = partes[0].replace(/[^0-9]/g, '');
    dv = partes[1].slice(0, 1); // Tomar solo el primer carac de lo que venga después del guión
  } else {
    // Si no tiene guión, limpiar todo de no-RUT
    limpio = limpio.replace(/[^0-9K]/g, '');
    if (limpio.length < 2) return limpio; // Caso de error o RUT incompleto
    cuerpo = limpio.slice(0, -1);
    dv = limpio.slice(-1);
  }

  // 3. Rellenar con ceros a la izquierda hasta tener 8 dígitos de cuerpo
  // Esto asegura que 9 millones quede como 09222054-0
  while (cuerpo.length < 8) {
    cuerpo = "0" + cuerpo;
  }

  return cuerpo + "-" + dv;
}

function buscarOCrearCarpeta(parent, name) {
  try {
    const folders = parent.getFoldersByName(name);
    if (folders.hasNext()) return folders.next();
    return parent.createFolder(name);
  } catch (e) {
    throw new Error("Error accediendo a carpeta '" + name + "'. Verifique permisos o existencia.");
  }
}

function crearEstructuraCarpetas(datos, metaData, mesProceso, anioProceso) {
  const nombreCarpetaAnio = `INFORMES ${anioProceso}`;
  const nombreCarpetaMes = mesProceso; // Ej: MARZO

  // Usamos la dirección que viene del formulario (que ya se actualizó con el jefe)
  // OJO: datos.direccion es lo que está en el input "inputDirJefatura" o "direccion"
  let rutaString = datos.direccion || metaData.direccion || "SIN DIRECCION";

  // Limpieza inicial
  rutaString = String(rutaString).trim();

  // Función recursiva para anidar carpetas
  function getJerarquia(rootID) {
    const root = DriveApp.getFolderById(rootID);

    // 1. Entrar/Crear carpeta AÑO (Ej: INFORMES 2026)
    let folderAnio = buscarOCrearCarpeta(root, nombreCarpetaAnio);
    
    // 2. Entrar/Crear carpeta MES (Ej: MARZO)
    let currentFolder = buscarOCrearCarpeta(folderAnio, nombreCarpetaMes);

    // 3. Desglosar la ruta de dirección "A / B / C"
    const partes = rutaString.split(" / ");

    // 4. Iterar creando carpetas anidadas por cada nivel jerárquico
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
    if (!letraInicial.match(/[A-Z]/)) letraInicial = "#";
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
// REGISTRO EN LOG → Consolidado en Logica.js (registrarEnLog)
// La función canónica usa TextFinder + LockService + normalizarRutCanonical
// ==========================================

