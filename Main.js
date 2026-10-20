/**
 * ============================================================
 * CONFIGURACIÓN GLOBAL
 * ============================================================
 * Centraliza IDs y constantes para fácil mantenimiento.
 *
 * IMPORTANTE:
 * - Google Sheets se mantiene durante la migración.
 * - Google Drive se mantiene como almacenamiento físico.
 * - Firebase será incorporado como nueva capa de datos.
 * - Las credenciales sensibles de Firebase NO se almacenan aquí.
 * ============================================================
 */

const CONFIG = {
    // --------------------------------------------------------
    // GOOGLE SHEETS
    // Se mantiene temporalmente durante la migración.
    // --------------------------------------------------------
    ID_SPREADSHEET: '1SRc7Ky9Nki2lppPoA43rEhnQ7_iNvNs2nAUODxRfk18',
    // --------------------------------------------------------
    // GOOGLE DOCS / PLANTILLA
    // --------------------------------------------------------
    ID_PLANTILLA: '1oFZAitbjtPMGN-PO53OHHKYoN3hPe3qK-4PJdDlFVnU',
    // --------------------------------------------------------
    // CARPETAS GOOGLE DRIVE
    // --------------------------------------------------------
    // Archivos firmados / finales
    ID_FOLDER_REMU: '1sYoa2pKtHw0CNsri0k08ddmAhGnKw4aN',

    // PDFs generados temporalmente
    ID_FOLDER_PDFS_GENERADOS: '1WuBMnFbVUMucCou5WCB-B9X12ViFhsTS',

    // Archivos censurados para transparencia
    ID_FOLDER_TRANSPARENCIA: '1gVceuQxXNqiCKiaNi04JbIZ1poi75o8O',

    // Documentos editables
    ID_FOLDER_DOCS: '1L6zukWYRavoqeSO3Sc-nzQVYPQIVBoiw',

    // --------------------------------------------------------
    // NOMBRES DE HOJAS
    // --------------------------------------------------------
    TAB_LOG: 'REGISTRO_HISTORICO',
    TAB_JEFATURA: 'JEFATURA',
    // --------------------------------------------------------
    // ZONA HORARIA
    // --------------------------------------------------------
    TIMEZONE: 'America/Santiago',

    // La clave CLOUD_RUN_API_KEY se configura en Script Properties.
    CLOUD_RUN_URL: 'https://generar-pdf-honorarios-92298248454.us-central1.run.app/generarPDF',
    // Motor validado en Cloud; Script Properties permite volver a DOCS si soporte lo requiere.
    CLOUD_PDF_MOTOR: 'HTML',
    // Referencia privada de una migración; la clave no está en el código y el archivo se retira al aplicarla.
    CLOUD_CONFIG_FILE: '', // Sincronización terminada; sin dependencia del archivo temporal.
    MAX_GENERACIONES: 3,
    MAX_SUBIDAS: 4,

    // --------------------------------------------------------
    // FIREBASE
    // --------------------------------------------------------
    //
    // NO colocar aquí:
    //
    // FIREBASE_URL
    // FIREBASE_TOKEN
    //
    // Esos valores serán obtenidos mediante:
    //
    // PropertiesService.getScriptProperties()
    //
    // FirebaseClient.js será responsable de acceder a ellos.
    // --------------------------------------------------------

    FIREBASE: {
        ROOT_PATH: '/'
    }
};


/**
 * ============================================================
 * WEB APP
 * ============================================================
 *
 * Punto de entrada principal de la aplicación.
 */
function doGet(e) {
    if (e && e.parameter && e.parameter.vista === 'recepcion') {
        exigirAdministradorRecepcion_();
        return HtmlService.createTemplateFromFile('RecepcionMasiva').evaluate()
            .setTitle('Recepción masiva de informes').addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    if (e && e.parameter && e.parameter.verificarConexionCloud === '1') {
        try { return ContentService.createTextOutput(JSON.stringify(comprobarConexionCloud_())).setMimeType(ContentService.MimeType.JSON); }
        catch(error) { return ContentService.createTextOutput(JSON.stringify({exito:false,error:String(error.message)})).setMimeType(ContentService.MimeType.JSON); }
    }
    try { asegurarConexionCloud_(); } catch(error) { console.warn('Configuración Cloud pendiente de sincronizar.'); }

    return HtmlService
        .createTemplateFromFile('Index')
        .evaluate()
        .setTitle('Gestión Informes - Muni Coquimbo')
        .addMetaTag(
            'viewport',
            'width=device-width, initial-scale=1'
        );
}


/**
 * ============================================================
 * INCLUDE
 * ============================================================
 *
 * Permite incluir archivos HTML dentro de Index.html.
 */
function include(filename) {

    return HtmlService
        .createHtmlOutputFromFile(filename)
        .getContent();
}


/**
 * ============================================================
 * INFORMACIÓN DEL SPREADSHEET
 * ============================================================
 *
 * Esta función se mantiene durante la migración.
 *
 * Firebase reemplazará progresivamente a Sheets como
 * almacenamiento operacional, pero no debemos eliminar
 * esta función todavía porque otros módulos pueden utilizarla.
 */
function obtenerInfoSpreadsheetConectado() {

    try {

        const ss =
            SpreadsheetApp.openById(
                CONFIG.ID_SPREADSHEET
            );

        const nombreHoja =
            obtenerNombreHojaMasReciente_(ss);

        return {

            nombre:
                ss.getName() +
                " | Pestaña: " +
                nombreHoja,

            url:
                ss.getUrl(),

            id:
                CONFIG.ID_SPREADSHEET
        };

    } catch (e) {
        return {

            nombre:
                "Planilla Desconocida (Sin acceso)",

            url:
                "#",

            id:
                CONFIG.ID_SPREADSHEET,

            error:
                e.toString()
        };
    }
}
