// Utilidades de plantilla y almacenamiento.
function llenarPlantilla_(body, d, mes, anio, fechaFirma, incluirContacto) {
    const reservado = 'DATOS RESERVADOS';
    const datos = {
        Nombre: d.nombre, Rut: incluirContacto ? d.rut : reservado, Direccion: d.direccion,
        Programa: d.programa, fecha: incluirContacto ? d.nacimiento : reservado,
        Jefatura: d.jefaturaNombre, Cargo: d.jefaturaCargo, DirJefatura: d.jefaturaDireccion,
        mes: mes, Mes: mes, anio: String(anio), periodoMes: d.fechaInicioMes,
        periodoFinMes: d.fechaFinMes,
        Dificultades_glosa: d.dificultades, FONO: incluirContacto ? d.fono : reservado,
        CORREO: incluirContacto ? d.correo : reservado,
        LICENCIA: incluirContacto || !d.datoLicencia || d.datoLicencia === 'NO PRESENTA' ? d.datoLicencia || 'NO PRESENTA' : reservado,
        ENFERMEDAD: incluirContacto || !d.datoEnfermedad || d.datoEnfermedad === 'NO PRESENTA' ? d.datoEnfermedad || 'NO PRESENTA' : reservado,
        VACACIONES: d.datoVacaciones || 'NO PRESENTA'
    };
    Object.keys(datos).forEach(function(k) { body.replaceText(escaparRegex_('{{' + k + '}}'), String(datos[k] || ' ')); });
    body.replaceText(escaparRegex_('{{funcion}}'), d.funcion || ' ');
    const formato = validarFormatoActividades_(d.actividadesFormato, d.actividades);
    if (formato && body.findText(escaparRegex_('{{informe_glosa}}'))) reemplazarActividadesConFormato_(body, formato);
    else body.replaceText(escaparRegex_('{{informe_glosa}}'), d.actividades || ' ');
}

/**
 * Función Auxiliar: Reemplaza un marcador de plantilla (ej: {{funcion}}) 
 * interpretando etiquetas HTML de negrita (<b>, <strong>), cursiva e itinerarios de línea
 * directamente en el Documento de Google Docs.
 */
function reemplazarMarcadorConHtml_(body, placeholder, htmlText) {
    if (!htmlText) return;

    // CORRECCIÓN: Se usa findText() en lugar de searchElement()
    var foundElement = body.findText(placeholder);
    if (!foundElement) return;

    var element = foundElement.getElement();
    var paragraph = element.getParent().asParagraph();
    var parent = paragraph.getParent();
    var index = parent.getChildIndex(paragraph);

    // Limpieza e igualación de etiquetas HTML
    var cleanHtml = htmlText
        .replace(/<p><br><\/p>/gi, '\n')
        .replace(/<p>/gi, '')
        .replace(/<\/p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<strong>/gi, '<b>')
        .replace(/<\/strong>/gi, '</b>')
        .replace(/<em>/gi, '<i>')
        .replace(/<\/em>/gi, '</i>');

    var lines = cleanHtml.split('\n');
    var currentInsertIndex = index;

    lines.forEach(function(line) {
        var cleanLine = line.trim();
        if (!cleanLine) return;

        var newPara = parent.insertParagraph(currentInsertIndex, "");
        currentInsertIndex++;

        // Expresión regular para separar bloques con formato
        var parts = cleanLine.split(/(<b>.*?<\/b>|<i>.*?<\/i>)/gi);

        parts.forEach(function(part) {
            if (!part) return;

            var isBold = /^<b>.*<\/b>$/i.test(part);
            var isItalic = /^<i>.*<\/i>$/i.test(part);
            var rawText = part.replace(/<[^>]+>/g, '');

            if (!rawText) return;

            var textElement = newPara.appendText(rawText);
            if (isBold) textElement.setBold(true);
            if (isItalic) textElement.setItalic(true);
        });
    });

    // Remover el marcador original {{funcion}}
    paragraph.removeFromParent();
}
/**
 * Escapa caracteres especiales de expresión regular en un texto.
 * body.findText() de Google Docs interpreta el patrón como regex,
 * por lo que teléfonos con '+', paréntesis, etc. rompen la búsqueda.
 */
function escaparRegex_(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function censurarDatos_(body, textosACensurar) {
    // Sustitución real; no se conserva el texto oculto detrás de un rectángulo.
    const textos = [...new Set(textosACensurar.map(String))].filter(function(t) { return t.trim().length >= 3; });
    textos.sort(function(a, b) { return b.length - a.length; });
    textos.forEach(function(texto) { body.replaceText(escaparRegex_(texto), 'DATOS RESERVADOS'); });
}

function variantesSensibles_(d) {
    const rut = normalizarRutCanonical_(d.rut);
    const partes = rut.split('-');
    const cuerpo = partes[0].replace(/^0+/, '');
    const conPuntos = cuerpo.replace(/(\d)(?=(\d{3})+$)/g, '$1.');
    const fono = String(d.fono || '').replace(/\D/g, '');
    return [d.rut || '', rut, cuerpo + '-' + partes[1], rut.replace('-', ''),
        cuerpo + partes[1], conPuntos + '-' + partes[1], '0' + conPuntos + '-' + partes[1],
        d.fono || '', fono, d.correo || '', String(d.correo || '').toUpperCase(), d.nacimiento || '',
        String(d.nacimiento || '').replace(/\//g, '-')];
}

function obtenerRangoFechas_(nombreMes, anio) {
    const mes = INFORMES_MESES.indexOf(String(nombreMes).toUpperCase().trim());
    if (mes < 0) throw new Error('Mes no reconocido.');
    const ultimo = new Date(Date.UTC(Number(anio), mes + 1, 0)).getUTCDate();
    const mm = ('0' + (mes + 1)).slice(-2);
    return { inicio: '01/' + mm + '/' + anio, fin: ('0' + ultimo).slice(-2) + '/' + mm + '/' + anio };
}

function fechaComparable_(fecha) { return fecha.split('/').reverse().join(''); }
function validarFechaPeriodo_(fecha, p) {
    const normalizada = String(fecha).trim().replace(/[.-]/g, '/');
    const match = normalizada.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const mes = INFORMES_MESES.indexOf(p.mes) + 1;
    const ultimo = Number(obtenerRangoFechas_(p.mes, p.anio).fin.slice(0, 2));
    if (!match || Number(match[2]) !== mes || Number(match[3]) !== p.anio || Number(match[1]) < 1 || Number(match[1]) > ultimo) {
        throw new Error('Las fechas del informe deben pertenecer al mes seleccionado.');
    }
    return normalizada;
}

function normalizarRutCanonical_(rut) {
    const limpio = String(rut || '').replace(/[.\s]/g, '').toUpperCase();
    const match = limpio.match(/^(\d{1,8})-?([0-9K])$/);
    if (!match) return '';
    return match[1].padStart(8, '0') + '-' + match[2];
}
/** Variantes exclusivas de la nómina: admite cuerpo sin DV y RUT completo sin guion. */
function variantesRutNomina_(valor) {
    const limpio = String(valor || '').replace(/[.\s]/g, '').toUpperCase();
    const variantes = new Set();
    const completo = normalizarRutCanonical_(limpio);
    if (completo && (limpio.includes('-') || limpio.length === 9 || completo.slice(-1) === digitoVerificadorRut_(completo.split('-')[0]))) variantes.add(completo);
    if (/^\d{7,8}$/.test(limpio)) {
        const dv = digitoVerificadorRut_(limpio);
        variantes.add(limpio.padStart(8, '0') + '-' + dv);
    }
    return Array.from(variantes);
}
function digitoVerificadorRut_(cuerpo) {
    let suma = 0, factor = 2;
    for (const digito of String(cuerpo).split('').reverse()) {
        suma += Number(digito) * factor;
        factor = factor === 7 ? 2 : factor + 1;
    }
    const resto = 11 - suma % 11;
    return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
}
function buscarOCrearCarpeta_(parent, name) {
    const cache = CacheService.getScriptCache();
    const hash = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, parent.getId() + '/' + name));
    const clave = 'FOLDER_V3_' + hash;
    const id = cache.get(clave);
    if (id) {
        try { const folder = DriveApp.getFolderById(id); if (!folder.isTrashed()) return folder; } catch (e) { cache.remove(clave); }
    }
    // Un ID reservado hace idempotente la creación de carpetas compartidas por distintos usuarios.
    // Las consultas/creaciones de Drive quedan fuera del candado del registro.
    const props = PropertiesService.getScriptProperties();
    const clavePersistente = 'CARPETA_V3_' + hash;
    let reservado = props.getProperty(clavePersistente);
    if (!reservado) {
        const folders = parent.getFoldersByName(name);
        const candidato = folders.hasNext() ? folders.next().getId()
            : Drive.Files.generateIds({ count: 1, space: 'drive', type: 'files' }).ids[0];
        reservado = conBloqueoInformes_(function() {
            const actual = props.getProperty(clavePersistente);
            if (actual) return actual;
            props.setProperty(clavePersistente, candidato);
            return candidato;
        });
    }
    try {
        const metadata = Drive.Files.get(reservado, { fields: 'id,trashed', supportsAllDrives: true });
        if (metadata.trashed) throw new Error('La carpeta fue eliminada. Contacte a soporte para restaurarla.');
    } catch (e) {
        if (!/404|not found/i.test(String(e))) throw e;
        try {
            Drive.Files.create({ id: reservado, name: name, mimeType: 'application/vnd.google-apps.folder',
                parents: [parent.getId()] }, null, { fields: 'id', supportsAllDrives: true });
        } catch (crearError) {
            if (!/409|already exists|Conflict/i.test(String(crearError))) throw crearError;
        }
    }
    const folder = DriveApp.getFolderById(reservado);
    cache.put(clave, reservado, 21600);
    return folder;
}
function crearEstructuraCarpetas_(datos, metaData, mesProceso, anioProceso, destinos) {
    const nombreCarpetaAnio = `INFORMES ${anioProceso}`;
    const nombreCarpetaMes = mesProceso; // Ej: MARZO
    // Usamos la dirección que viene del formulario (que ya se actualizó con el jefe)
    // OJO: datos.direccion es lo que está en el input "inputDirJefatura" o "direccion"
    let rutaString = metaData.direccion || datos.direccion || "SIN DIRECCION";
    // Limpieza inicial
    rutaString = String(rutaString).trim();
    // Función recursiva para anidar carpetas
    function getJerarquia(rootID) {
        const root = DriveApp.getFolderById(rootID);
        // 1. Entrar/Crear carpeta AÑO (Ej: INFORMES 2026)
        let folderAnio = buscarOCrearCarpeta_(root, nombreCarpetaAnio);
        // 2. Entrar/Crear carpeta MES (Ej: MARZO)
        let currentFolder = buscarOCrearCarpeta_(folderAnio, nombreCarpetaMes);
        // 3. Desglosar la ruta de dirección "A / B / C"
        const partes = rutaString.split(" / ");
        // 4. Iterar creando carpetas anidadas por cada nivel jerárquico
        partes.forEach(parte => {
            let nombreLimpio = parte.trim();
            // Ignorar partes vacías o guiones solos
            if (nombreLimpio && nombreLimpio !== "-" && nombreLimpio !== "0") {
                currentFolder = buscarOCrearCarpeta_(currentFolder, nombreLimpio);
            }
        });
        return currentFolder;
    }
    function getTransparenciaFolder() {
        const rootTransp = DriveApp.getFolderById(CONFIG.ID_FOLDER_TRANSPARENCIA);
        const fAnioTransp = buscarOCrearCarpeta_(rootTransp, nombreCarpetaAnio);
        const fMesTransp = buscarOCrearCarpeta_(fAnioTransp, nombreCarpetaMes);
        let letraInicial = datos.nombre.charAt(0).toUpperCase();
        if (!letraInicial.match(/[A-Z]/))
            letraInicial = "#";
        const folderLetra = buscarOCrearCarpeta_(fMesTransp, letraInicial);
        return folderLetra;
    }
    const solicitados = destinos || ['docs', 'generados', 'remu', 'transp'];
    const carpetas = {};
    if (solicitados.includes('docs')) carpetas.docs = getJerarquia(CONFIG.ID_FOLDER_DOCS);
    if (solicitados.includes('generados')) carpetas.generados = getJerarquia(CONFIG.ID_FOLDER_PDFS_GENERADOS);
    if (solicitados.includes('remu')) carpetas.remu = getJerarquia(CONFIG.ID_FOLDER_REMU);
    if (solicitados.includes('transp')) carpetas.transp = getTransparenciaFolder();
    return carpetas;
}
// ==========================================
// REGISTRO EN LOG → Consolidado en Logica.js (registrarEnLog_)
// La función canónica usa TextFinder + LockService + normalizarRutCanonical_
// ==========================================
