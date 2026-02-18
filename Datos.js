/**
 * ==========================================================================
 * GESTOR DE DATOS - MASTER MERGE (V-ENTERPRISE)
 * Base: Código 1 (Vigente) | Mejoras: Código 2 (Validaciones y Estabilidad)
 * ==========================================================================
 */

// --- 1. BUSCADOR PRINCIPAL (Lógica Negocio C1 + Estabilidad C2) ---

function buscarFuncionario(rutBusqueda) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    const nombreHojaDotacion = obtenerNombreHojaMasReciente(ss);
    
    if (!nombreHojaDotacion) return { encontrado: false, errorCritico: "No hay hoja de dotación vigente." };
    
    const sheetDotacion = ss.getSheetByName(nombreHojaDotacion);
    
    // 1. NORMALIZACIÓN DEL INPUT
    const rutInputLimpio = String(rutBusqueda).replace(/^0+/, '').replace(/[^0-9kK]/g, '').toUpperCase();
    
    // 2. LEER ENCABEZADOS Y NORMALIZARLOS PARA BÚSQUEDA INSENSIBLE A ACENTOS
    const lastCol = sheetDotacion.getLastColumn();
    // Helper para normalizar headers (quita acentos y espacios extra)
    const normalizeHeader = (s) => String(s).toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ');
    const headers = sheetDotacion.getRange(1, 1, 1, lastCol).getValues()[0].map(normalizeHeader);
    
    const COL_RUT_IDX = headers.indexOf("RUT"); 
    if (COL_RUT_IDX === -1) return { encontrado: false, errorCritico: "Falta columna RUT en dotación" };

    const lastRow = sheetDotacion.getLastRow();
    if (lastRow < 2) return { encontrado: false };

    // 3. BUSQUEDA DE FILA (Optimizado)
    const listaRutsSheet = sheetDotacion.getRange(2, COL_RUT_IDX + 1, lastRow - 1, 1).getValues();
    let filaIndex = -1;
    
    for (let i = 0; i < listaRutsSheet.length; i++) {
        let rutHoja = String(listaRutsSheet[i][0]).replace(/^0+/, '').replace(/[^0-9kK]/g, '').toUpperCase();
        if (rutHoja === rutInputLimpio) {
            filaIndex = i + 2; 
            break; 
        }
    }

    if (filaIndex === -1) return { encontrado: false };

    // 4. LECTURA DE DATOS Y MAPEO
    const datosFila = sheetDotacion.getRange(filaIndex, 1, 1, lastCol).getValues()[0];

    // Mapeo de Índices Generales
    let COL_NOM_IDX = headers.indexOf("NOMBRE COMPLETO");
    if (COL_NOM_IDX === -1) COL_NOM_IDX = headers.findIndex(h => h.includes("NOMBRE") && h.includes("COMPLETO"));
    const COL_NAC_IDX = headers.indexOf("FECHA DE NACIMIENTO");
    const COL_ORIGEN_IDX = headers.indexOf("ORIGEN_DATOS");
    const COL_FONO_IDX = headers.findIndex(h => h.match(/CELULAR|TELEFONO|MOVIL|CONTACTO/));
    const COL_EMAIL_IDX = headers.findIndex(h => h.match(/CORREO|EMAIL|MAIL/)); 

    // --- CORRECCIÓN JERARQUÍA DE CARPETAS (Individual) ---
    // Buscamos explícitamente las columnas de jerarquía
    const COL_DIR_IDX = headers.indexOf("DIRECCION");       // Nivel 1 (G)
    const COL_DEPTO_IDX = headers.indexOf("DEPARTAMENTO");  // Nivel 2 (H)
    const COL_OFICINA_IDX = headers.indexOf("OFICINA");     // Nivel 3 (I)

    // Procesamiento de Nombre y Fecha
    let fechaNac = datosFila[COL_NAC_IDX];
    if (fechaNac instanceof Date) fechaNac = Utilities.formatDate(fechaNac, CONFIG.TIMEZONE, "dd/MM/yyyy");
    
    let nombreFinal = "";
    if (COL_NOM_IDX > -1 && datosFila[COL_NOM_IDX]) {
        nombreFinal = datosFila[COL_NOM_IDX];
    } else {
        const nIdx = headers.indexOf("NOMBRES"), aIdx = headers.indexOf("APELLIDOS");
        nombreFinal = (nIdx > -1 && aIdx > -1) ? datosFila[nIdx] + " " + datosFila[aIdx] : "Funcionario";
    }

    // --- LÓGICA DE FUNCIÓN ---
    let funcionFinal = "";
    const f1 = headers.findIndex(h => h.includes("FUNCION") && h.includes("PRIMER"));
    const f2 = headers.findIndex(h => h.includes("FUNCION") && h.includes("SEGUNDO"));
    const fPerf = headers.findIndex(h => h.includes("DESCRIPCION") && h.includes("PERFIL"));
    const fGen = headers.indexOf("FUNCION");
    
    const v1 = f1 > -1 ? String(datosFila[f1]) : "";
    const v2 = f2 > -1 ? String(datosFila[f2]) : "";
    const vP = fPerf > -1 ? String(datosFila[fPerf]) : "";
    const vG = fGen > -1 ? String(datosFila[fGen]) : "";

    let origenDatos = COL_ORIGEN_IDX > -1 ? String(datosFila[COL_ORIGEN_IDX]).toUpperCase() : "";

    if (origenDatos.includes("SUMA ALZADA")) {
        funcionFinal = vP.length > 5 ? vP : (v2.length > 5 ? v2 : (v1.length > 5 ? v1 : vG));
    } else {
        funcionFinal = vP.length > 15 ? vP : (v2.length > 10 ? v2 : (v1.length > 10 ? v1 : vG));
    }

    // --- LÓGICA DE PROGRAMA ---
    let programaFinal = "";
    const p1Idx = headers.findIndex(h => h.includes("PROGRAMA") && h.includes("PRIMER") && !h.includes("CODIGO"));
    const p2Idx = headers.findIndex(h => h.includes("PROGRAMA") && h.includes("SEGUNDO") && !h.includes("CODIGO"));
    const pGenIdx = headers.findIndex(h => h.includes("PROGRAMA") && !h.includes("CODIGO") && !h.includes("PRIMER") && !h.includes("SEGUNDO"));

    const p1 = p1Idx > -1 ? String(datosFila[p1Idx]) : "";
    const p2 = p2Idx > -1 ? String(datosFila[p2Idx]) : "";
    const pGen = pGenIdx > -1 ? String(datosFila[pGenIdx]) : "";

    programaFinal = p2.length > 5 ? p2 : (p1.length > 5 ? p1 : (pGen.length > 5 ? pGen : ""));
    
    if (origenDatos.includes("SUMA ALZADA")) {
        if (!programaFinal || programaFinal.length < 3) programaFinal = "Honorario Suma Alzada";
    } else {
        if (!programaFinal) programaFinal = origenDatos;
    }

    // --- CONSTRUCCIÓN DE RUTA DE CARPETAS (FIX) ---
    // Unimos Dirección / Depto / Oficina limpiando códigos
    const cleanUnit = (val) => {
        if(!val) return "";
        let s = String(val).trim();
        if(s === "-" || s === "0" || s === "") return "";
        return s.replace(/^\(\d+\)\s*/, "").trim(); // Quita (29) al inicio
    };

    let dirParts = [];
    
    // Nivel 1: Dirección
    if (COL_DIR_IDX > -1) { 
        let val = cleanUnit(datosFila[COL_DIR_IDX]); 
        if(val) dirParts.push(val); 
    }
    // Nivel 2: Departamento
    if (COL_DEPTO_IDX > -1) { 
        let val = cleanUnit(datosFila[COL_DEPTO_IDX]); 
        if(val) dirParts.push(val); 
    }
    // Nivel 3: Oficina
    if (COL_OFICINA_IDX > -1) { 
        let val = cleanUnit(datosFila[COL_OFICINA_IDX]); 
        if(val) dirParts.push(val); 
    }

    // Si no encontró nada (fallback a índices fijos por si acaso cambian nombres)
    if (dirParts.length === 0) {
        // Intentar columnas 6 y 7 (G y H) si existen
        if (datosFila[6]) dirParts.push(cleanUnit(datosFila[6]));
        if (datosFila[7]) dirParts.push(cleanUnit(datosFila[7]));
    }

    // Unimos con " / " para que Utils.gs cree la jerarquía
    let direccionFull = dirParts.join(" / ");

    let resultado = {
      encontrado: true,
      rut: String(datosFila[COL_RUT_IDX]).trim(),
      nombre: String(nombreFinal).replace(/["']/g, ""), 
      nacimiento: String(fechaNac),
      origen: origenDatos,
      programa: programaFinal, 
      funcion: funcionFinal.replace(/["']/g, ""), 
      direccion: direccionFull, // Aquí va la ruta jerárquica
      email: COL_EMAIL_IDX > -1 ? String(datosFila[COL_EMAIL_IDX]).trim() : "",
      fono: COL_FONO_IDX > -1 ? String(datosFila[COL_FONO_IDX]).trim() : "",
      jefaturaSugerida: "", jefaturaSubSugerida: "",
      sesionPendiente: false, sesionFinalizada: false, esLote: false 
    };
    
    // Buscar jefatura basada en la dirección construida (o parte de ella)
    if (direccionFull && typeof obtenerJefaturaPorDireccion === 'function') {
        // Intentamos buscar por la dirección más específica (Oficina), si no Depto, si no Dirección
        // Pero obtenerJefaturaPorDireccion ya busca coincidencias parciales
        let jefInfo = obtenerJefaturaPorDireccion(direccionFull);
        if (jefInfo) {
            resultado.jefaturaSugerida = jefInfo.titular;
            resultado.jefaturaSubSugerida = jefInfo.sub;
        }
    }

    // 5. VERIFICACIÓN EN LOG
    const f = new Date();
    const m = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][f.getMonth()];
    const anioActual = f.getFullYear();
    
    const check = verificarExistenciaEnLog(rutInputLimpio, m, anioActual);
    
    if(check.existe) {
          if (check.rutFormateado) resultado.rut = check.rutFormateado; 
          resultado.links = { remu: check.linkRemu, transp: check.linkTransp };
          resultado.sesionFinalizada = check.estado ? check.estado.includes("FINALIZADO") : false;
          resultado.sesionPendiente = !resultado.sesionFinalizada;
          resultado.actividadesAnteriores = check.actividades; 
          
          if (check.actividades && check.actividades.length > 20 && typeof buscarGrupoLote === 'function') {
              const checkGrupo = buscarGrupoLote(check.actividades, m, anioActual);
              if (checkGrupo.esGrupoGrande) {
                  resultado.esLote = true;
                  resultado.loteDetectado = checkGrupo.lista; 
                  resultado.mensajeLote = `Este RUT pertenece a un grupo de ${checkGrupo.lista.length} personas.`;
              }
          }
    } else if (typeof obtenerUltimaActividad === 'function') {
        const actPrev = obtenerUltimaActividad(rutInputLimpio);
        if(actPrev) resultado.actividadesAnteriores = actPrev;
    }

    return resultado;
  } catch (e) {
    return { encontrado: false, errorCritico: e.toString() };
  }
}

// --- 2. VERIFICACIÓN DE EXISTENCIA (MEJORA C2: FIX GUION) ---
// Se implementa la lógica del Código 2 que reconstruye el guion para asegurar match en Logs antiguos

function verificarExistenciaEnLog(rut, mes, anio) {
  const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
  const sheet = ss.getSheetByName(CONFIG.TAB_LOG);
  if (!sheet) return { existe: false };
  
  // 1. Limpieza inicial
  let limpio = String(rut).replace(/^0+/, '').replace(/[^0-9kK]/g, '').toUpperCase();
  let rutBusqueda = limpio;

  // 2. RECONSTRUCCIÓN CON GUION (Mejora C2)
  // Permite encontrar RUTs guardados como "12345678-9" aunque se busque "123456789"
  if (limpio.length > 1) {
      let cuerpo = limpio.slice(0, -1);
      let dv = limpio.slice(-1);
      // Mantener lógica de C1 por si se necesita padding (opcional, pero seguro mantener el standard limpio)
      // while (cuerpo.length < 8) { cuerpo = "0" + cuerpo; } // Descomentar si BD antigua usa ceros a la izq
      rutBusqueda = cuerpo + "-" + dv;
  }

  console.log("🔍 [Datos] Verificando existencia en LOG para RUT: " + rutBusqueda + " (" + mes + " " + anio + ")");

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { existe: false };

  // 3. Búsqueda
  const finder = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutBusqueda);
  const ocurrencias = finder.findAll();
  
  // Iteración inversa (Mejora C2)
  for (let i = ocurrencias.length - 1; i >= 0; i--) {
      const row = ocurrencias[i].getRow();
      const rowData = sheet.getRange(row, 1, 1, 17).getValues()[0];
      
      // Filtro estricto Mes/Año (Mejora C2: trim y uppercase)
      if (String(rowData[1]).trim().toUpperCase() === String(mes).toUpperCase() && 
          String(rowData[2]).trim() == anio) {
          
          console.log("✅ [Datos] Registro previo encontrado en fila: " + row);
          
          return { 
            existe: true, 
            rutFormateado: rowData[3], // Devuelve el RUT tal cual está en el Log
            nombreLog: rowData[4],
            estado: rowData[5], 
            linkDocs: rowData[6], 
            linkRemu: rowData[7], 
            linkTransp: rowData[8], 
            linkRespaldo: rowData[9], 
            actividades: rowData[10] 
          };
      }
  }
  return { existe: false };
}

// --- 3. GESTIÓN DE LOGS (Consolidado) ---
// Se mantiene C1 principalmente, asegurando LockService

function registrarEnLog(data) {
  const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
  let sheet = ss.getSheetByName(CONFIG.TAB_LOG);
  
  if (!sheet) {
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

  const timestamp = new Date();
  const linkRespaldoFinal = data.linkRespaldo || "AUN SIN ADJUNTAR";
  const rutInput = String(data.rut).split('-')[0].replace(/^0+/, '').replace(/\./g, '').trim();
  const valorLicencia = data.licenciasTexto || data.licencias || "NO PRESENTA"; 

  const lastRow = sheet.getLastRow();
  let filaEncontrada = -1;

  if (lastRow > 1) {
      const finder = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutInput);
      const ocurrencias = finder.findAll();
      for (let i = 0; i < ocurrencias.length; i++) {
          const row = ocurrencias[i].getRow();
          const meta = sheet.getRange(row, 2, 1, 2).getValues()[0];
          if (String(meta[0]).trim() === data.mes && String(meta[1]).trim() == data.anio) {
              filaEncontrada = row;
              break;
          }
      }
  }

  const lock = LockService.getScriptLock();
  try {
      lock.waitLock(15000); 

      if (filaEncontrada > 0) {
          // ACTUALIZAR
          const range = sheet.getRange(filaEncontrada, 1, 1, 22);
          const values = range.getValues()[0];

          values[0] = timestamp; 
          values[5] = data.estado; 
          
          if (data.linkDocs && data.linkDocs !== "---") values[6] = data.linkDocs;
          if (data.linkRemu && data.linkRemu !== "---") values[7] = data.linkRemu;
          if (data.linkTransp && data.linkTransp !== "---") values[8] = data.linkTransp;
          if (data.linkRespaldo && data.linkRespaldo !== "---") values[9] = linkRespaldoFinal;
          
          if (data.actividades && data.actividades !== "---") {
              values[10] = data.actividades;
              values[11] = data.funcion;
              values[13] = valorLicencia;
              values[14] = data.periodos || values[14];
              values[17] = data.fechaInicio || values[17];
              values[18] = data.fechaFin || values[18];
              values[19] = data.jefaturaNombre;
              values[20] = data.jefaturaCargo;
              values[21] = data.direccion;
          }
          
          if (data.correo) values[15] = data.correo;
          if (data.fono) values[16] = data.fono;

          range.setValues([values]);

      } else {
          // NUEVA FILA
          sheet.appendRow([
            timestamp, data.mes, data.anio, data.rut, data.nombre, data.estado,
            data.linkDocs || "---", data.linkRemu || "---", data.linkTransp || "---", linkRespaldoFinal,
            data.actividades || "---", data.funcion || "---", data.dificultades || "Sin dificultades",
            valorLicencia, data.periodos || "---", data.correo || "---", data.fono || "---",
            data.fechaInicio || "---", data.fechaFin || "---",
            data.jefaturaNombre || "---", data.jefaturaCargo || "---", data.direccion || "---"
          ]);
      }
      return { exito: true };

  } catch(e) {
      return { exito: false, error: e.toString() };
  } finally {
      lock.releaseLock();
  }
}

// --- 4. CACHÉ DE JEFATURAS ---

function obtenerMapaJefaturasDesdeSheet() {
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get("MAPA_JEFATURAS_V1");
  
  if (cachedData) {
      try { return JSON.parse(cachedData); } catch (e) { console.warn("Cache parse error"); }
  }

  const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
  const sheet = ss.getSheetByName('JEFATURA');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const mapa = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0]) mapa[String(row[0]).toUpperCase().trim()] = { titular: row[1], sub: row[2] };
    if (row[3] && row[3] !== '-' && row[3] !== '') mapa[String(row[3]).toUpperCase().trim()] = { titular: row[4], sub: row[5] };
    if (row[6] && row[6] !== '-' && row[6] !== '') mapa[String(row[6]).toUpperCase().trim()] = { titular: row[7], sub: row[8] };
  }
  
  try { cache.put("MAPA_JEFATURAS_V1", JSON.stringify(mapa), 21600); } catch(e) {}
  return mapa;
}

// --- 5. BÚSQUEDA DE GRUPO LOTE (Mejora C2: Filtro Estricto) ---

function buscarGrupoLote(actividadBusqueda, mes, anio) {
    if (!actividadBusqueda || actividadBusqueda.length < 10) return { esGrupoGrande: false };
    
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    const sheet = ss.getSheetByName(CONFIG.TAB_LOG);
    if (!sheet) return { esGrupoGrande: false };
    
    const datos = sheet.getDataRange().getValues();
    const h = datos[0].map(x => String(x).toUpperCase().trim());
    const idxAct = h.indexOf("RESUMEN ACTIVIDADES");
    const idxRut = h.indexOf("RUT");
    const idxNom = h.indexOf("NOMBRE");
    const idxMes = h.indexOf("MES INFORME");
    const idxAnio = h.indexOf("AÑO");
    const idxLinkRemu = h.indexOf("LINK PDF REMU");
    const idxLinkTransp = h.indexOf("LINK PDF TRANSP");
    const idxEstado = h.indexOf("ESTADO");
    const idxFunc = h.indexOf("FUNCIÓN (CONTRATO)");

    if (idxAct === -1) return { esGrupoGrande: false };
    
    const clean = (t) => String(t).replace(/\s+/g,' ').toUpperCase();
    const target = clean(actividadBusqueda);
    let encontrados = [];

    // [MEJORA C2] Iteración inversa optimizada
    for (let i = datos.length - 1; i >= 1; i--) {
        // [MEJORA C2] FILTRO ESTRICTO MES Y AÑO
        if (String(datos[i][idxMes]).toUpperCase().trim() === String(mes).toUpperCase().trim() && 
            String(datos[i][idxAnio]).trim() == anio) {
            
            let current = clean(datos[i][idxAct]);
            // Comparación: Exacta o primeros 50 caracteres (Lógica C1 mantenida)
            if (current === target || (current.length > 50 && target.length > 50 && current.substring(0,50) === target.substring(0,50))) {
                encontrados.push({
                    rut: datos[i][idxRut], 
                    nombre: datos[i][idxNom],
                    links: { remu: datos[i][idxLinkRemu], transp: datos[i][idxLinkTransp] },
                    status: datos[i][idxEstado].includes("FINALIZADO") ? "FINALIZADO" : "GENERADO",
                    funcion: (idxFunc > -1) ? datos[i][idxFunc] : "",
                    encontrado: true, 
                    uploaded: datos[i][idxEstado].includes("FINALIZADO")
                });
            }
        }
        if (encontrados.length > 50) break; 
    }
    return { esGrupoGrande: encontrados.length > 1, lista: encontrados };
}


// --- 6. VALIDACIÓN DE LOTE MASIVO (Mejora C2: Helper `getIdx` + Mapeo Robusto) ---
// Se usa la estructura mejorada de C2 pero se asegura la lógica de negocio de C1

function validarLoteFuncionarios(listaRuts) {
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    
    // 1. Obtener Datos Dotación
    const nombreHojaDotacion = obtenerNombreHojaMasReciente(ss);
    if (!nombreHojaDotacion) return [{ error: "No hay hoja de dotación." }];
    
    // 2. Historial (Optimizado)
    const sheetLog = ss.getSheetByName(CONFIG.TAB_LOG);
    const mapaHistorial = {}; 
    const fechaActual = new Date();
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

    if (sheetLog && sheetLog.getLastRow() > 1) {
        const datosLog = sheetLog.getDataRange().getValues();
        const h = datosLog[0].map(x => String(x).toUpperCase().trim());
        const idxMes = h.indexOf('MES INFORME');
        const idxAnio = h.indexOf('AÑO');
        const idxRut = h.indexOf('RUT');
        const idxEstado = h.indexOf('ESTADO');
        const idxLinkRemu = h.indexOf('LINK PDF REMU');
        const idxLinkTransp = h.indexOf('LINK PDF TRANSP');
        
        for (let i = 1; i < datosLog.length; i++) {
            let fila = datosLog[i];
            let r = String(fila[idxRut]).replace(/[^0-9kK]/g, '').toUpperCase();
            let m = String(fila[idxMes]).toUpperCase().trim();
            let a = String(fila[idxAnio]).trim();
            let key = r + "_" + m + "_" + a; 
            
            mapaHistorial[key] = {
                estado: fila[idxEstado],
                linkRemu: fila[idxLinkRemu],
                linkTransp: fila[idxLinkTransp]
            };
            
            let mesActualNombre = meses[fechaActual.getMonth()].toUpperCase();
            let anioActual = fechaActual.getFullYear();
            if (m === mesActualNombre && a == anioActual) {
                 mapaHistorial[r] = {
                    estado: fila[idxEstado],
                    linkRemu: fila[idxLinkRemu],
                    linkTransp: fila[idxLinkTransp]
                };
            }
        }
    }

    // 3. Procesar Dotación con Jerarquía Correcta
    const sheet = ss.getSheetByName(nombreHojaDotacion);
    const datos = sheet.getDataRange().getValues();
    
    // [CORRECCIÓN] Normalizamos headers quitando acentos para que "DIRECCIÓN" matchee con "DIRECCION"
    const normalizeHeader = (s) => String(s).toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ');
    const h = datos[0].map(normalizeHeader);
    
    const getIdx = (keywords, avoid = []) => {
        return h.findIndex(header => {
            const match = keywords.every(k => header.includes(k));
            const safe = avoid.length === 0 || !avoid.some(a => header.includes(a));
            return match && safe;
        });
    };

    const map = {
        rut: h.indexOf("RUT"),
        nombre: h.findIndex(x => x === "NOMBRE COMPLETO" || (x.includes("NOMBRES") && x.includes("APELLIDOS"))),
        origen: h.indexOf("ORIGEN_DATOS"),
        email: h.findIndex(x => x.includes("CORREO") || x.includes("EMAIL")),
        
        // IDENTIFICACIÓN PRECISA DE COLUMNAS DE JERARQUÍA (Ahora es insensible a acentos)
        colDireccion: h.indexOf("DIRECCION"),      // Nivel 1
        colDepto: h.indexOf("DEPARTAMENTO"),     // Nivel 2
        colOficina: h.indexOf("OFICINA"),        // Nivel 3
        
        func1: getIdx(["FUNCION", "PRIMER", "SEMESTRE"]),
        func2: getIdx(["FUNCION", "SEGUNDO", "SEMESTRE"]),
        funcGen: h.indexOf("FUNCION"), 
        funcPerfil: getIdx(["DESCRIPCION", "PERFIL"]),
        prog1: getIdx(["PROGRAMA", "PRIMER", "SEMESTRE"], ["CODIGO"]),
        prog2: getIdx(["PROGRAMA", "SEGUNDO", "SEMESTRE"], ["CODIGO"]),
        progGen: h.indexOf("PROGRAMA")
    };

    if (map.rut === -1) return [{ error: "Error Crítico: No se encuentra la columna RUT." }];

    let mapaDotacion = {};
    for(let i=1; i<datos.length; i++) {
        let fila = datos[i];
        let rutRaw = String(fila[map.rut]);
        let rutKey = rutRaw.replace(/[^0-9kK]/g, '').toUpperCase();
        
        let nombre = map.nombre > -1 ? String(fila[map.nombre]).replace(/["']/g, "") : "Sin Nombre";
        let origen = map.origen > -1 ? String(fila[map.origen]).toUpperCase() : "";
        let emailTexto = map.email > -1 ? String(fila[map.email]) : "";

        // --- CONSTRUCCIÓN ROBUSTA DE LA RUTA DE CARPETAS ---
        const cleanUnit = (val) => {
             if(!val) return "";
             let s = String(val).trim();
             if(s === "-" || s === "0" || s === "") return "";
             // Quita códigos numéricos al inicio como "(29) " o "(01) "
             return s.replace(/^\(\d+\)\s*/, "").trim(); 
        };

        let dirParts = [];
        // Nivel 1: Dirección (Ej: DIRECCION DE RECURSOS HUMANOS)
        if (map.colDireccion > -1) { 
            let v = cleanUnit(fila[map.colDireccion]); 
            if(v) dirParts.push(v); 
        }
        // Nivel 2: Departamento (Ej: DEPARTAMENTO DE PERSONAL)
        if (map.colDepto > -1) { 
            let v = cleanUnit(fila[map.colDepto]); 
            if(v) dirParts.push(v); 
        }
        // Nivel 3: Oficina (Ej: OFICINA DE MOVIMIENTO...)
        if (map.colOficina > -1) { 
            let v = cleanUnit(fila[map.colOficina]); 
            if(v) dirParts.push(v); 
        }
        
        // Al unir con " / ", el sistema de carpetas (Utils.gs) entenderá que debe anidarlas.
        // Resultado: "DIRECCION RRHH / DEPTO PERSONAL / OFICINA MOVIMIENTO"
        let direccionFull = dirParts.join(" / "); 

        // Extracción Datos Funciones y Programas
        const f1 = map.func1 > -1 ? String(fila[map.func1]).trim() : "";
        const f2 = map.func2 > -1 ? String(fila[map.func2]).trim() : "";
        const fGen = map.funcGen > -1 ? String(fila[map.funcGen]).trim() : "";
        const fPerfil = map.funcPerfil > -1 ? String(fila[map.funcPerfil]).trim() : "";

        const p1 = map.prog1 > -1 ? String(fila[map.prog1]).trim() : "";
        const p2 = map.prog2 > -1 ? String(fila[map.prog2]).trim() : "";
        const pGen = map.progGen > -1 ? String(fila[map.progGen]).trim() : "";

        let funcionFinal = "";
        let programaFinal = "";

        if (origen.includes("SUMA ALZADA")) {
            programaFinal = "Honorario Suma Alzada";
            if (fPerfil.length > 5) funcionFinal = fPerfil;
            else if (f2.length > 5) funcionFinal = f2;
            else if (f1.length > 5) funcionFinal = f1;
            else funcionFinal = fGen;
        } else {
            if (f2.length > 5 && f2 !== "-" && f2 !== "0") funcionFinal = f2;
            else if (f1.length > 5 && f1 !== "-" && f1 !== "0") funcionFinal = f1;
            else if (fGen.length > 5) funcionFinal = fGen;
            else if (fPerfil.length > 5) funcionFinal = fPerfil;

            if (p2.length > 5 && p2 !== "-" && p2 !== "0") programaFinal = p2;
            else if (p1.length > 5 && p1 !== "-" && p1 !== "0") programaFinal = p1;
            else if (pGen.length > 5) programaFinal = pGen;
            
            if (!programaFinal || programaFinal.length < 3) programaFinal = origen || "PROGRAMA NO DEFINIDO";
        }

        let rutVisual = rutRaw.trim();
        if (/^[0-9]\./.test(rutVisual) && rutVisual.length < 12) rutVisual = "0" + rutVisual;

        mapaDotacion[rutKey] = {
            rutVisual: rutVisual,
            nombre: nombre,
            funcion: funcionFinal,
            programa: programaFinal,
            origen: origen,
            email: emailTexto,
            direccion: direccionFull // Ruta jerárquica lista para crear carpetas
        };
    }

    // 4. RESPUESTA
    return listaRuts.map(input => {
       let cleanInput = String(input).split('-')[0].replace(/^0+/, '').replace(/\./g, '').trim().toUpperCase();
       
       if(mapaDotacion[cleanInput]) {
           const d = mapaDotacion[cleanInput];
           const historial = mapaHistorial[cleanInput]; 
           
           let estadoRecuperado = null;
           let linksRecuperados = null;
           let uploadedRecuperado = false;

           if (historial) {
               if (historial.estado.includes("GENERADO")) estadoRecuperado = "GENERADO";
               if (historial.estado.includes("FINALIZADO")) {
                   estadoRecuperado = "FINALIZADO";
                   uploadedRecuperado = true;
               }
               if (historial.linkRemu && historial.linkRemu.length > 5) {
                   linksRecuperados = { remu: historial.linkRemu, transp: historial.linkTransp };
               }
           }

           return {
               rut: d.rutVisual,
               nombre: d.nombre,
               funcion: d.funcion,
               programa: d.programa,
               origen: d.origen,
               email: d.email,
               direccion: d.direccion,
               encontrado: true,
               status: estadoRecuperado || "SIN GENERAR",
               links: linksRecuperados,
               uploaded: uploadedRecuperado
           };
       }
       return { rut: input, nombre: "NO ENCONTRADO", encontrado: false };
    });
}

// --- 7. UTILS & HELPERS ---

function borrarRegistro(rut, mes) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    const sheet = ss.getSheetByName(CONFIG.TAB_LOG);
    if (!sheet) throw new Error("No existe hoja de log.");

    const fechaActual = new Date();
    let anio = fechaActual.getFullYear();
    if (mes === "Diciembre" && fechaActual.getMonth() === 0) anio = anio - 1;

    // [MEJORA C2] Limpieza de RUT más completa
    const rutClean = String(rut).replace(/\./g, '').replace(/-/g, '').trim();
    
    const finder = sheet.getRange("D:D").createTextFinder(rutClean);
    const ocurrencias = finder.findAll();
    
    let fila = -1;
    // [MEJORA C2] Búsqueda inversa
    for (let i = ocurrencias.length - 1; i >= 0; i--) {
        const row = ocurrencias[i].getRow();
        const data = sheet.getRange(row, 2, 1, 2).getValues()[0];
        if (String(data[0]).trim() === mes && String(data[1]).trim() == anio) {
            fila = row;
            break;
        }
    }

    if (fila === -1) return { exito: false, msj: "Registro no encontrado." };

    const rowData = sheet.getRange(fila, 7, 1, 4).getValues()[0];
    const urls = [rowData[0], rowData[1], rowData[2], rowData[3]];
    urls.forEach(url => {
        if (url && url.includes("google.com")) {
            try {
                const id = url.match(/[-\w]{25,}/);
                if (id) DriveApp.getFileById(id[0]).setTrashed(true);
            } catch(e) {}
        }
    });

    sheet.deleteRow(fila);
    return { exito: true };

  } catch(e) {
    return { exito: false, msj: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function obtenerUltimaActividad(rut) {
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    const sheet = ss.getSheetByName(CONFIG.TAB_LOG);
    if (!sheet) return "";
    const finder = sheet.getRange("D:D").createTextFinder(String(rut).replace(/\./g,'').replace(/-/g,'').trim());
    const prev = finder.findPrevious();
    if(prev) return sheet.getRange(prev.getRow(), 11).getValue();
    return "";
}

function obtenerNombreHojaMasReciente(ss) {
  const meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  const nombreMesActual = meses[new Date().getMonth()];
  const hojas = ss.getSheets();
  let candidata = hojas[0].getName();
  
  for(let h of hojas) {
      if(h.getName().toUpperCase().startsWith(nombreMesActual)) {
          candidata = h.getName();
          break;
      }
  }
  return candidata;
}

function obtenerMetadataSegura(rut) {
    const res = buscarFuncionario(rut);
    if (res.encontrado) return res;
    return { direccion: "" };
}

function obtenerListaNombresJefaturas() {
  const mapa = obtenerMapaJefaturasDesdeSheet();
  const nombres = new Set();
  Object.values(mapa).forEach(obj => {
    if (obj.titular && obj.titular !== '-' && obj.titular !== '0') nombres.add(String(obj.titular).toUpperCase());
    if (obj.sub && obj.sub !== '-' && obj.sub !== '0') nombres.add(String(obj.sub).toUpperCase());
  });
  return Array.from(nombres).sort();
}

function obtenerJefaturaPorDireccion(dir) {
    if(!dir) return null;
    const mapa = obtenerMapaJefaturasDesdeSheet();
    const d = dir.trim().toUpperCase();
    if(mapa[d]) return mapa[d];
    for (const [k, v] of Object.entries(mapa)) {
        if (d.includes(k)) return v;
    }
    return null;
}

// [MEJORA C2] Función más compacta y robusta
function buscarInfoJefaturaPorNombre(nombre) {
  const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
  const sheet = ss.getSheetByName('JEFATURA');
  const data = sheet.getDataRange().getValues();
  
  const target = String(nombre).toUpperCase().trim();

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    
    const cleanUnit = (val) => {
       let v = String(val).trim();
       return (v === "-" || v === "0" || v === "") ? "" : v;
    };

    const dir = cleanUnit(r[0]);
    const depto = cleanUnit(r[3]);
    const ofi = cleanUnit(r[6]);

    if (String(r[1]).toUpperCase().trim() === target) return { cargo: "DIRECTOR(A)", unidad: dir, esSub: false };
    if (String(r[2]).toUpperCase().trim() === target) return { cargo: "DIRECTOR(A)", unidad: dir, esSub: true };

    if (String(r[4]).toUpperCase().trim() === target) {
      let ruta = dir;
      if (depto) ruta += " / " + depto;
      return { cargo: "JEFE(A) DE DEPARTAMENTO", unidad: ruta, esSub: false };
    }
    if (String(r[5]).toUpperCase().trim() === target) {
      let ruta = dir;
      if (depto) ruta += " / " + depto;
      return { cargo: "JEFE(A) DE DEPARTAMENTO", unidad: ruta, esSub: true };
    }

    if (String(r[7]).toUpperCase().trim() === target) {
      let ruta = dir;
      if (depto) ruta += " / " + depto;
      if (ofi) ruta += " / " + ofi;
      return { cargo: "ENCARGADO(A) DE OFICINA", unidad: ruta, esSub: false };
    }
  }
  return null;
}