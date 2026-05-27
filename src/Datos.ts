/**
 * ==========================================================================
 * GESTOR DE DATOS - MASTER MERGE (V-ENTERPRISE)
 * Base: Código 1 (Vigente) | Mejoras: Código 2 (Validaciones y Estabilidad)
 * ==========================================================================
 */

// --- REGLAS EXTENSIBLES POR CALIDAD CONTRACTUAL ---
// Agregar nuevas calidades aquí. Cada entrada define cómo seleccionar función y programa.
// Se busca por coincidencia parcial en el campo ORIGEN_DATOS.

const REGLAS_CALIDAD = {
    // Regla por defecto (PRESTADORES y todas las demás calidades)
    "_DEFAULT": {
        obtenerFuncion: function (f1, f2, fGen, fPerfil) {
            if (f2.length > 5 && f2 !== "-" && f2 !== "0") return f2;
            if (f1.length > 5 && f1 !== "-" && f1 !== "0") return f1;
            if (fGen.length > 5) return fGen;
            if (fPerfil.length > 5) return fPerfil;
            return "";
        },
        obtenerPrograma: function (p1, p2, pGen, origen) {
            if (p2.length > 5 && p2 !== "-" && p2 !== "0") return p2;
            if (p1.length > 5 && p1 !== "-" && p1 !== "0") return p1;
            if (pGen.length > 5) return pGen;
            return origen || "PROGRAMA NO DEFINIDO";
        }
    },
    // Regla especial para SUMA ALZADA
    "SUMA ALZADA": {
        obtenerFuncion: function (f1, f2, fGen, fPerfil) {
            if (fPerfil.length > 5) return fPerfil;
            if (f2.length > 5) return f2;
            if (f1.length > 5) return f1;
            return fGen;
        },
        obtenerPrograma: function (p1, p2, pGen, origen) {
            return "Honorario Suma Alzada";
        }
    }
    // EXTENSIBLE: Agregar nuevas calidades aquí, ejemplo:
    // "CONVENIO": { obtenerFuncion: function(...) { ... }, obtenerPrograma: function(...) { ... } },
};

/**
 * Obtiene la regla de calidad aplicable según el origen de datos.
 * @param {string} origen - Valor de la columna ORIGEN_DATOS (ej: "HONORARIOS SUMA ALZADA")
 * @returns {Object} Regla con métodos obtenerFuncion y obtenerPrograma
 */
function obtenerReglaCalidad(origen) {
    var origenUpper = String(origen).toUpperCase();
    for (var key in REGLAS_CALIDAD) {
        if (key !== "_DEFAULT" && origenUpper.includes(key)) return REGLAS_CALIDAD[key];
    }
    return REGLAS_CALIDAD["_DEFAULT"];
}

// --- 1. BUSCADOR PRINCIPAL (Lógica Negocio C1 + Estabilidad C2) ---

function buscarFuncionario(rutBusqueda) {
    try {
        const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
        const nombreHojaDotacion = obtenerNombreHojaMasReciente(ss);

        if (!nombreHojaDotacion) return { encontrado: false, errorCritico: "No hay hoja de dotación vigente." };

        // Implementación de CacheService para mitigar lecturas masivas
        const cache = CacheService.getScriptCache();
        const CACHE_KEY = "NOMINA_CACHE_V2_" + nombreHojaDotacion;
        let datosCompletos;
        
        const cached = cache.get(CACHE_KEY);
        if (cached) {
            datosCompletos = JSON.parse(cached); // Lectura ultrarrápida desde RAM
        } else {
            const sheetDotacion = ss.getSheetByName(nombreHojaDotacion);
            datosCompletos = sheetDotacion.getDataRange().getValues();
            try {
                cache.put(CACHE_KEY, JSON.stringify(datosCompletos), 1800); // Guardar por 30 minutos (1800s)
            } catch (cacheErr) {
                console.warn("Aviso: La hoja es demasiado grande para guardarse en caché. Se leerá en vivo.");
            }
        }

        // 1. NORMALIZACIÓN DEL INPUT
        const rutInputLimpio = normalizarRutCanonical(rutBusqueda);

        // 2. LEER ENCABEZADOS Y NORMALIZARLOS PARA BÚSQUEDA INSENSIBLE A ACENTOS
        const normalizeHeader = (s) => String(s).toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ');
        
        let headerRowIdx = 0;
        let headers = datosCompletos[0].map(normalizeHeader);
        for (let i = 0; i < Math.min(10, datosCompletos.length); i++) {
            const tempH = datosCompletos[i].map(normalizeHeader);
            if (tempH.indexOf("RUT") !== -1) {
                headerRowIdx = i;
                headers = tempH;
                break;
            }
        }

        const COL_RUT_IDX = headers.indexOf("RUT");
        if (COL_RUT_IDX === -1) return { encontrado: false, errorCritico: "No se pudo encontrar la columna RUT en las primeras filas de la hoja." };

        if (datosCompletos.length < (headerRowIdx + 1)) return { encontrado: false };

        // 3. BUSQUEDA EN MEMORIA ULTRA-ROBUSTA
        // Generamos todas las variantes del RUT buscado para comparar contra cualquier formato en la hoja
        const generarVariantesRut = (rut) => {
            // rut ya viene en formato canonical: "09222054-0"
            const variantes = new Set();
            variantes.add(rut); // canonical con cero
            const sinCero = rut.replace(/^0+/, ''); // sin cero inicial
            variantes.add(sinCero);
            // con y sin guión
            variantes.add(rut.replace(/-/g, ''));
            variantes.add(sinCero.replace(/-/g, ''));
            // con puntos (formato visual chileno)
            const cuerpo = rut.split('-')[0];
            const dv = rut.split('-')[1] || '';
            const cuerpoSinCero = cuerpo.replace(/^0+/, '');
            if (cuerpoSinCero.length >= 7) {
                const conPuntos = cuerpoSinCero.replace(/(\d)(\d{3})(\d{3})$/, '$1.$2.$3');
                variantes.add(conPuntos + '-' + dv);
                variantes.add(conPuntos.replace(/\./g, '') + '-' + dv);
            }
            return variantes;
        };
        const variantesInput = generarVariantesRut(rutInputLimpio);

        let datosFila = null;
        for (let i = headerRowIdx + 1; i < datosCompletos.length; i++) {
            const celda = datosCompletos[i][COL_RUT_IDX];
            if (!celda && celda !== 0) continue;
            // Normalizar el RUT de la hoja también
            const rutHojaCanonical = normalizarRutCanonical(celda);
            // Comparar: canonical vs canonical, Y también variantes vs raw
            if (rutHojaCanonical === rutInputLimpio || variantesInput.has(rutHojaCanonical)) {
                datosFila = datosCompletos[i];
                break;
            }
        }

        if (!datosFila) return { encontrado: false };

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

        // --- LÓGICA DE FUNCIÓN Y PROGRAMA (EXTENSIBLE) ---
        let origenDatos = COL_ORIGEN_IDX > -1 ? String(datosFila[COL_ORIGEN_IDX]).toUpperCase() : "";
        const regla = obtenerReglaCalidad(origenDatos);

        // Mapeo de valores para la regla
        const f1 = headers.findIndex(h => h.includes("FUNCION") && h.includes("PRIMER"));
        const f2 = headers.findIndex(h => h.includes("FUNCION") && h.includes("SEGUNDO"));
        const fPerf = headers.findIndex(h => h.includes("DESCRIPCION") && h.includes("PERFIL"));
        const fGen = headers.indexOf("FUNCION");

        const v1 = f1 > -1 ? String(datosFila[f1]) : "";
        const v2 = f2 > -1 ? String(datosFila[f2]) : "";
        const vP = fPerf > -1 ? String(datosFila[fPerf]) : "";
        const vG = fGen > -1 ? String(datosFila[fGen]) : "";

        const p1Idx = headers.findIndex(h => h.includes("PROGRAMA") && h.includes("PRIMER") && !h.includes("CODIGO"));
        const p2Idx = headers.findIndex(h => h.includes("PROGRAMA") && h.includes("SEGUNDO") && !h.includes("CODIGO"));
        const pGenIdx = headers.findIndex(h => h.includes("PROGRAMA") && !h.includes("CODIGO") && !h.includes("PRIMER") && !h.includes("SEGUNDO"));

        const p1 = p1Idx > -1 ? String(datosFila[p1Idx]) : "";
        const p2 = p2Idx > -1 ? String(datosFila[p2Idx]) : "";
        const pGen = pGenIdx > -1 ? String(datosFila[pGenIdx]) : "";

        const funcionFinal = regla.obtenerFuncion(v1, v2, vG, vP);
        const programaFinal = regla.obtenerPrograma(p1, p2, pGen, origenDatos);

        // --- CONSTRUCCIÓN DE RUTA DE CARPETAS (FIX) ---
        // Unimos Dirección / Depto / Oficina limpiando códigos
        const cleanUnit = (val) => {
            if (!val) return "";
            let s = String(val).trim();
            if (s === "-" || s === "0" || s === "") return "";
            return s.replace(/^\(\d+\)\s*/, "").trim(); // Quita (29) al inicio
        };

        let dirParts = [];

        // Nivel 1: Dirección
        if (COL_DIR_IDX > -1) {
            let val = cleanUnit(datosFila[COL_DIR_IDX]);
            if (val) dirParts.push(val);
        }
        // Nivel 2: Departamento
        if (COL_DEPTO_IDX > -1) {
            let val = cleanUnit(datosFila[COL_DEPTO_IDX]);
            if (val) dirParts.push(val);
        }
        // Nivel 3: Oficina
        if (COL_OFICINA_IDX > -1) {
            let val = cleanUnit(datosFila[COL_OFICINA_IDX]);
            if (val) dirParts.push(val);
        }

        // Si no encontró nada (fallback a índices fijos por si acaso cambian nombres)
        if (dirParts.length === 0) {
            // Intentar columnas 6 y 7 (G y H) si existen
            if (datosFila[6]) dirParts.push(cleanUnit(datosFila[6]));
            if (datosFila[7]) dirParts.push(cleanUnit(datosFila[7]));
        }

        // Unimos con " / " para que Utils.gs cree la jerarquía
        let direccionFull = dirParts.join(" / ");

        let resultado: any = {
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
        const m = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"][f.getMonth()];
        const anioActual = f.getFullYear();

        const check = verificarExistenciaEnLog(rutInputLimpio, m, anioActual);

        if (check.existe) {
            if (check.rutFormateado) resultado.rut = check.rutFormateado;
            resultado.links = { remu: check.linkRemu, transp: check.linkTransp };
            resultado.sesionFinalizada = check.estado ? check.estado.includes("FINALIZADO") : false;
            resultado.sesionPendiente = !resultado.sesionFinalizada;
            
            // Cargar datos históricos completos
            const ultimoRegistro = obtenerUltimoRegistroCompleto(rutInputLimpio);
            if (ultimoRegistro) {
                resultado.actividadesAnteriores = ultimoRegistro.actividades;
                resultado.fonoHistorico = ultimoRegistro.fono;
                resultado.correoHistorico = ultimoRegistro.correo;
                resultado.jefaturaHistorica = {
                    nombre: ultimoRegistro.jefaturaNombre,
                    cargo: ultimoRegistro.jefaturaCargo,
                    direccion: ultimoRegistro.jefaturaDireccion
                };
                resultado.funcionHistorica = ultimoRegistro.funcion;
            }

            if (check.actividades && check.actividades.length > 20 && typeof buscarGrupoLote === 'function') {
                const checkGrupo = buscarGrupoLote(check.actividades, m, anioActual);
                if (checkGrupo.esGrupoGrande) {
                    resultado.esLote = true;
                    resultado.loteDetectado = checkGrupo.lista;
                    resultado.mensajeLote = `Este RUT pertenece a un grupo de ${checkGrupo.lista.length} personas.`;
                }
            }
        } else {
            const ultimoRegistro = obtenerUltimoRegistroCompleto(rutInputLimpio);
            if (ultimoRegistro) {
                resultado.actividadesAnteriores = ultimoRegistro.actividades;
                resultado.fonoHistorico = ultimoRegistro.fono;
                resultado.correoHistorico = ultimoRegistro.correo;
                resultado.jefaturaHistorica = {
                    nombre: ultimoRegistro.jefaturaNombre,
                    cargo: ultimoRegistro.jefaturaCargo,
                    direccion: ultimoRegistro.jefaturaDireccion
                };
                resultado.funcionHistorica = ultimoRegistro.funcion;
            }
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

    // Usar RUT canonical para búsqueda consistente
    const rutCanonical = normalizarRutCanonical(rut);
    const mesNorm = String(mes).toUpperCase().trim();

    console.log("🔍 [Datos] Verificando existencia en LOG para RUT: " + rutCanonical + " (" + mesNorm + " " + anio + ")");

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { existe: false };

    // Búsqueda con RUT canonical
    let buscador = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutCanonical);
    let ocurrencias = buscador.findAll();

    // Fallback: buscar sin guión si no hay resultados
    if (ocurrencias.length === 0) {
        const rutSinGuion = rutCanonical.replace(/-/g, '');
        buscador = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutSinGuion);
        ocurrencias = buscador.findAll();
    }

    // Iteración inversa (último registro del periodo)
    for (let i = ocurrencias.length - 1; i >= 0; i--) {
        const row = ocurrencias[i].getRow();
        const rowData = sheet.getRange(row, 1, 1, 19).getValues()[0];

        if (String(rowData[1]).trim().toUpperCase() === mesNorm &&
            String(rowData[2]).trim() == anio) {

            console.log("✅ [Datos] Registro previo encontrado en fila: " + row);

            return {
                existe: true,
                rutFormateado: rowData[3],
                nombreLog: rowData[4],
                estado: rowData[5],
                linkDocs: rowData[6],
                linkRemu: rowData[7],
                linkTransp: rowData[8],
                linkRespaldo: rowData[9],
                actividades: rowData[10],
                fechaInicio: rowData[17],
                fechaFin: rowData[18]
            };
        }
    }
    return { existe: false };
}

// --- 3. GESTIÓN DE LOGS (Consolidado) ---
// Se mantiene C1 principalmente, asegurando LockService

// registrarEnLog → Consolidada en Logica.js como registrarEnLogOptimizado
// Usar registrarEnLogOptimizado(data) para registrar en log

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

    try { cache.put("MAPA_JEFATURAS_V1", JSON.stringify(mapa), 21600); } catch (e) { }
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
    const idxLinkDocs = h.indexOf("LINK DOCS");
    const idxLinkRemu = h.indexOf("LINK PDF REMU");
    const idxLinkTransp = h.indexOf("LINK PDF TRANSP");
    const idxEstado = h.indexOf("ESTADO");
    const idxFunc = h.indexOf("FUNCIÓN (CONTRATO)");

    if (idxAct === -1) return { esGrupoGrande: false };

    const clean = (t) => String(t).replace(/\s+/g, ' ').toUpperCase();
    const target = clean(actividadBusqueda);
    let encontrados = [];

    // [MEJORA C2] Iteración inversa optimizada
    for (let i = datos.length - 1; i >= 1; i--) {
        // [MEJORA C2] FILTRO ESTRICTO MES Y AÑO
        if (String(datos[i][idxMes]).toUpperCase().trim() === String(mes).toUpperCase().trim() &&
            String(datos[i][idxAnio]).trim() == anio) {

            let current = clean(datos[i][idxAct]);
            // Comparación: Exacta o primeros 50 caracteres (Lógica C1 mantenida)
            if (current === target || (current.length > 50 && target.length > 50 && current.substring(0, 50) === target.substring(0, 50))) {
                encontrados.push({
                    rut: datos[i][idxRut],
                    nombre: datos[i][idxNom],
                    links: {
                        remu: datos[i][idxLinkRemu],
                        transp: datos[i][idxLinkTransp],
                        docs: (idxLinkDocs > -1) ? datos[i][idxLinkDocs] : ""
                    },
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
    const meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

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
            if (m === mesActualNombre && a == String(anioActual)) {
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

    // [CORRECCIÓN] Normalizamos headers quitando acentos y buscamos en qué fila están
    const normalizeHeader = (s) => String(s).toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ');
    
    let headerRowIdx = 0;
    let h = datos[0].map(normalizeHeader);
    for (let i = 0; i < Math.min(10, datos.length); i++) {
        const tempH = datos[i].map(normalizeHeader);
        if (tempH.indexOf("RUT") !== -1) {
            headerRowIdx = i;
            h = tempH;
            break;
        }
    }

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
    for (let i = headerRowIdx + 1; i < datos.length; i++) {
        let fila = datos[i];
        let rutRaw = String(fila[map.rut]);
        let rutKey = normalizarRutCanonical(rutRaw);

        let nombre = map.nombre > -1 ? String(fila[map.nombre]).replace(/["']/g, "") : "Sin Nombre";
        let origen = map.origen > -1 ? String(fila[map.origen]).toUpperCase() : "";
        let emailTexto = map.email > -1 ? String(fila[map.email]) : "";

        // --- CONSTRUCCIÓN ROBUSTA DE LA RUTA DE CARPETAS ---
        const cleanUnit = (val) => {
            if (!val) return "";
            let s = String(val).trim();
            if (s === "-" || s === "0" || s === "") return "";
            // Quita códigos numéricos al inicio como "(29) " o "(01) "
            return s.replace(/^\(\d+\)\s*/, "").trim();
        };

        let dirParts = [];
        // Nivel 1: Dirección (Ej: DIRECCION DE RECURSOS HUMANOS)
        if (map.colDireccion > -1) {
            let v = cleanUnit(fila[map.colDireccion]);
            if (v) dirParts.push(v);
        }
        // Nivel 2: Departamento (Ej: DEPARTAMENTO DE PERSONAL)
        if (map.colDepto > -1) {
            let v = cleanUnit(fila[map.colDepto]);
            if (v) dirParts.push(v);
        }
        // Nivel 3: Oficina (Ej: OFICINA DE MOVIMIENTO...)
        if (map.colOficina > -1) {
            let v = cleanUnit(fila[map.colOficina]);
            if (v) dirParts.push(v);
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

        // Aplicar Reglas de Calidad
        const regla = obtenerReglaCalidad(origen);
        const funcionFinal = regla.obtenerFuncion(f1, f2, fGen, fPerfil);
        let programaFinal = regla.obtenerPrograma(p1, p2, pGen, origen);

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
        let cleanInput = normalizarRutCanonical(input);

        if (mapaDotacion[cleanInput]) {
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
        if (mes === "DICIEMBRE" && fechaActual.getMonth() === 0) anio = anio - 1;

        // [MEJORA C2] Limpieza de RUT más completa
        const rutClean = normalizarRutCanonical(rut);

        const finder = sheet.getRange("D:D").createTextFinder(rutClean);
        const ocurrencias = finder.findAll();

        let fila = -1;
        // [MEJORA C2] Búsqueda inversa
        for (let i = ocurrencias.length - 1; i >= 0; i--) {
            const row = ocurrencias[i].getRow();
            const data = sheet.getRange(row, 2, 1, 2).getValues()[0];
            if (String(data[0]).trim() === mes && String(data[1]).trim() == String(anio)) {
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
                } catch (e) { }
            }
        });

        sheet.deleteRow(fila);
        return { exito: true };

    } catch (e) {
        return { exito: false, msj: e.toString() };
    } finally {
        lock.releaseLock();
    }
}

function obtenerUltimoRegistroCompleto(rut) {
    const ss = SpreadsheetApp.openById(CONFIG.ID_SPREADSHEET);
    const sheet = ss.getSheetByName(CONFIG.TAB_LOG);
    if (!sheet) return null;
    
    const rutClean = normalizarRutCanonical(rut);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    // Buscar la última ocurrencia del RUT
    const finder = sheet.getRange(2, 4, lastRow - 1, 1).createTextFinder(rutClean).matchEntireCell(true);
    const ocurrencias = finder.findAll();
    
    if (ocurrencias.length === 0) return null;

    // Tomar la última fila encontrada
    const row = ocurrencias[ocurrencias.length - 1].getRow();
    const data = sheet.getRange(row, 1, 1, 22).getValues()[0];

    return {
        actividades: data[10],      // Col K
        funcion: data[11],          // Col L
        correo: data[15],           // Col P
        fono: data[16],             // Col Q
        jefaturaNombre: data[19],   // Col T
        jefaturaCargo: data[20],    // Col U
        jefaturaDireccion: data[21] // Col V
    };
}

function obtenerNombreHojaMasReciente(ss) {
    const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
    // Hojas excluidas del sistema (no son nóminas de dotación)
    const HOJAS_EXCLUIDAS = ["LOG", "JEFATURA", "REGISTRO", "CONFIG", "HISTORICO", "ENCARGADOS", "INFORMES"];
    const hoy = new Date();
    const hojas = ss.getSheets();

    // Paso 1: Recopilar todas las hojas de dotación con su fecha detectada
    // Formato esperado: "MAYO 18/05/26" o "MAYO 01/04/26" etc.
    let candidatasConFecha = [];
    let candidatasFallback = [];

    for (let h of hojas) {
        const nombre = h.getName().trim();
        const nombreUpper = nombre.toUpperCase();

        // Filtrar hojas del sistema
        if (HOJAS_EXCLUIDAS.some(ex => nombreUpper.includes(ex))) continue;

        // Ver si el nombre empieza con un mes conocido
        const mesPrefijo = MESES.find(m => nombreUpper.startsWith(m));
        if (!mesPrefijo) continue;

        // Intentar extraer fecha del nombre (ej: "18/05/26" o "01/04/26")
        const matchFecha = nombre.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (matchFecha) {
            const dia = parseInt(matchFecha[1]);
            const mes = parseInt(matchFecha[2]) - 1; // 0-indexed
            let anio = parseInt(matchFecha[3]);
            if (anio < 100) anio += 2000;
            const fechaHoja = new Date(anio, mes, dia);
            candidatasConFecha.push({ nombre, fechaHoja });
        } else {
            // No tiene fecha explícita, guardar como fallback por índice de mes
            const idxMes = MESES.indexOf(mesPrefijo);
            candidatasFallback.push({ nombre, idxMes });
        }
    }

    // Paso 2: Elegir la hoja más reciente que no sea del futuro
    // (la de fecha más alta que sea <= hoy)
    if (candidatasConFecha.length > 0) {
        // Ordenar de más reciente a más antigua
        candidatasConFecha.sort((a, b) => b.fechaHoja.getTime() - a.fechaHoja.getTime());
        // Buscar la más reciente que no supere la fecha de hoy
        for (let c of candidatasConFecha) {
            if (c.fechaHoja <= hoy) {
                console.log("[Datos] Hoja seleccionada: " + c.nombre + " (fecha: " + c.fechaHoja + ")");
                return c.nombre;
            }
        }
        // Si todas son futuro (raro), devolver la primera igual
        return candidatasConFecha[0].nombre;
    }

    // Paso 3: Fallback — sin fechas, usar el mes más cercano al actual
    if (candidatasFallback.length > 0) {
        const mesActual = hoy.getMonth();
        candidatasFallback.sort((a, b) => {
            const dA = Math.abs(a.idxMes - mesActual);
            const dB = Math.abs(b.idxMes - mesActual);
            return dA - dB;
        });
        return candidatasFallback[0].nombre;
    }

    // Último recurso: primera hoja
    return hojas.length > 0 ? hojas[0].getName() : null;
}

function obtenerMetadataSegura(rut) {
    const res = buscarFuncionario(rut);
    if (res.encontrado) return res;
    return { direccion: "" };
}

function obtenerListaNombresJefaturas() {
    const mapa = obtenerMapaJefaturasDesdeSheet();
    const nombres = new Set();
    Object.values(mapa).forEach((obj: any) => {
        if (obj.titular && obj.titular !== '-' && obj.titular !== '0') nombres.add(String(obj.titular).toUpperCase());
        if (obj.sub && obj.sub !== '-' && obj.sub !== '0') nombres.add(String(obj.sub).toUpperCase());
    });
    return Array.from(nombres).sort();
}

function obtenerJefaturaPorDireccion(dir) {
    if (!dir) return null;
    const mapa = obtenerMapaJefaturasDesdeSheet();
    const d = dir.trim().toUpperCase();
    if (mapa[d]) return mapa[d];
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