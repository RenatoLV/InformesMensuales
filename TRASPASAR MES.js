/**
 * SCRIPT DE CONSOLIDACIÓN MENSUAL (ETL) - VERSIÓN ROBUSTA V4 (MAPEO INTELIGENTE)
 * * Estrategia: "Smart Mapping".
 * 1. Escanea todos los encabezados de todas las hojas para crear un "Encabezado Maestro".
 * 2. Mapea cada celda a su posición correcta, sin importar el orden original.
 * 3. Garantiza que datos como 'Dirección' no terminen en 'Teléfono'.
 */

// 1. CONFIGURACIÓN DE IDs
const ID_FUENTE_MAESTRA = "1YO9yrSC7gtLnmUrcfcM39tJ_5BN_BCsyiWloKAzFlc8"; // Datos Originales
const ID_DESTINO_APP = "1SRc7Ky9Nki2lppPoA43rEhnQ7_iNvNs2nAUODxRfk18";   // Excel App

// 2. HOJAS A PROCESAR
const HOJAS_A_LEER = [
  "PRESTADORES DE SERVICIO",
  "HONORARIOS SUMA ALZADA",
  "ADMINISTRACION DE FONDOS",
  "ESCUELA DE VERANO",
  "BANDA LOS MENAS",
  "CAMPEONES PARA COQUIMBO",
  "SIN MARCAJE"
];

function consolidarDotacionMensual() {
  const tiempoInicio = new Date();
  console.log("🚀 INICIANDO CONSOLIDACIÓN CON MAPEO INTELIGENTE (V4)...");

  // 1. Configuración de Fecha y Nombre de Hoja
  const meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  
  // Generamos el nombre con formato: MES DD/MM/YY (Ej: ENERO 22/01/26)
  const mesActual = meses[tiempoInicio.getMonth()];
  const fechaFormateada = Utilities.formatDate(tiempoInicio, Session.getScriptTimeZone(), "dd/MM/yy");
  const nombreMes = `${mesActual} ${fechaFormateada}`;
  
  console.log(`📅 Mes Objetivo: ${nombreMes}`);

  let ssFuente, ssDestino;
  try {
    ssFuente = SpreadsheetApp.openById(ID_FUENTE_MAESTRA);
    ssDestino = SpreadsheetApp.openById(ID_DESTINO_APP);
  } catch (e) {
    console.error("❌ Error Fatal abriendo libros: " + e.message);
    return;
  }

  // --- FASE 1: CONSTRUCCIÓN DEL ENCABEZADO MAESTRO ---
  // Recorremos todas las hojas SOLO para saber qué columnas existen en total.
  let uniqueHeaders = new Set();
  // Agregamos nuestras columnas fijas primero
  uniqueHeaders.add("ORIGEN_DATOS"); 

  // Mapa para guardar los datos crudos temporalmente y no leer el Excel dos veces
  let rawDataCache = []; 

  for (let nombreHoja of HOJAS_A_LEER) {
    const hoja = ssFuente.getSheetByName(nombreHoja);
    if (!hoja) {
      console.warn(`⚠️ Hoja no encontrada: ${nombreHoja}`);
      continue;
    }

    const data = hoja.getDataRange().getValues();
    if (data.length > 0) {
      const headers = data[0]; // Primera fila
      
      // Normalizamos y guardamos headers únicos
      headers.forEach(h => {
        if(h !== "") uniqueHeaders.add(h.toString().trim());
      });

      // Guardamos para la Fase 2
      rawDataCache.push({
        nombre: nombreHoja,
        headers: headers.map(h => h.toString().trim()),
        filas: data.slice(1) // Solo datos, sin encabezado
      });
    }
  }

  // Convertimos el Set a Array para tener el índice fijo (MASTER HEADERS)
  const masterHeaders = Array.from(uniqueHeaders);
  console.log(`📏 Encabezado Maestro creado con ${masterHeaders.length} columnas.`);

  // --- FASE 2: NORMALIZACIÓN Y MAPEO DE DATOS ---
  let datosConsolidados = [];

  for (let item of rawDataCache) {
    console.log(`🔄 Procesando datos de: ${item.nombre}...`);
    
    // Crear un "Mapa de Índices" para esta hoja específica
    // Ejemplo: Si en esta hoja "RUT" es la col 3, y en el Maestro es la 5, guardamos esa relación.
    let colMap = item.headers.map(h => masterHeaders.indexOf(h));

    // Procesar cada fila de esta hoja
    for (let filaOriginal of item.filas) {
      // 1. Validar si la fila tiene datos relevantes (Ej: Nombre o Rut)
      // Asumimos que si las primeras columnas están vacías, la fila no sirve.
      // Ajusta los índices [0,1,2] si tus datos clave están más adelante.
      let tieneDatos = filaOriginal.some(celda => celda !== "");
      if (!tieneDatos) continue;

      // 2. Crear una fila nueva VACÍA con el tamaño del Maestro
      let filaNormalizada = new Array(masterHeaders.length).fill("");

      // 3. Llenar columna de Origen (Siempre sabemos que es la primera en masterHeaders si la agregamos primero)
      // Buscamos el índice de "ORIGEN_DATOS" por seguridad
      let idxOrigen = masterHeaders.indexOf("ORIGEN_DATOS");
      if (idxOrigen !== -1) filaNormalizada[idxOrigen] = item.nombre;

      // 4. Mapear cada celda a su posición correcta
      filaOriginal.forEach((celda, indexOriginal) => {
        let indexMaestro = colMap[indexOriginal];
        if (indexMaestro !== -1 && indexMaestro !== undefined) {
          filaNormalizada[indexMaestro] = celda;
        }
      });

      datosConsolidados.push(filaNormalizada);
    }
  }

  console.log(`✅ Total registros procesados: ${datosConsolidados.length}`);

  if (datosConsolidados.length === 0) {
    console.warn("⚠️ No se generaron datos para guardar.");
    return;
  }

  // --- FASE 3: ESCRITURA ---
  try {
    // 1. Escribir Hoja con nombre del Mes y Fecha (ej: ENERO 22/01/26)
    escribirEnHoja(ssDestino, nombreMes, masterHeaders, datosConsolidados);
    
    // 2. Escribir Hoja "DOTACION MOV" (para que la App siga funcionando siempre)
    escribirEnHoja(ssDestino, "DOTACION MOV", masterHeaders, datosConsolidados);
  } catch (e) {
    console.error("❌ Error escribiendo datos: " + e.message);
  }

  console.log("🏁 CONSOLIDACIÓN EXITOSA V4");
}

/**
 * Función auxiliar de escritura
 */
function escribirEnHoja(ss, nombreHoja, headers, data) {
  let hoja = ss.getSheetByName(nombreHoja);
  
  if (hoja) {
    hoja.clear(); 
  } else {
    hoja = ss.insertSheet(nombreHoja);
  }

  // Escribir Encabezados
  if (headers && headers.length > 0) {
    hoja.getRange(1, 1, 1, headers.length)
        .setValues([headers])
        .setFontWeight("bold")
        .setBackground("#e2e8f0");
  }

  // Escribir Datos
  if (data.length > 0) {
    // IMPORTANTE: Asegurar que el rango coincida exactamente con la matriz de datos
    hoja.getRange(2, 1, data.length, data[0].length).setValues(data);
  }
  
  // Congelar panel y ajustar anchos básicos
  hoja.setFrozenRows(1);
  // Opcional: Ajustar ancho de columnas automáticamente (puede ser lento con muchos datos)
  // hoja.autoResizeColumns(1, headers.length); 
}