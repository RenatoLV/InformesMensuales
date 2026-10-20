/** Configuración privada de una sola aplicación; nunca devuelve credenciales al navegador. */
function asegurarConexionCloud_() {
    const archivoId = CONFIG.CLOUD_CONFIG_FILE;
    if (!archivoId) return;
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('CLOUD_CONFIG_FILE_APLICADO') === archivoId) return;
    try {
        const archivo = DriveApp.getFileById(archivoId);
        const config = JSON.parse(archivo.getBlob().getDataAsString());
        if (!config || config.version !== 'conexion-cloud-20261014-v1' || config.expira < Date.now() ||
            !/^https:\/\/[a-z0-9.-]+\.run\.app\/generarPDF$/.test(config.url) ||
            typeof config.apiKey !== 'string' || config.apiKey.length < 16) throw new Error('Configuración temporal no válida o vencida.');
        // Una petición inválida autenticada debe responder 400, sin generar PDF ni archivos.
        const prueba = UrlFetchApp.fetch(config.url, {method:'post',contentType:'application/json',
            headers:{'x-api-key':config.apiKey},payload:'{}',muteHttpExceptions:true});
        if (prueba.getResponseCode() !== 400) throw new Error('Cloud no confirmó la autenticación de la configuración.');
        props.setProperties({CLOUD_RUN_API_KEY:config.apiKey,CLOUD_RUN_URL:config.url,CLOUD_PDF_MOTOR:'HTML',CLOUD_CONFIG_FILE_APLICADO:archivoId});
        try {archivo.setTrashed(true);} catch(e) {console.warn('Pendiente retirar configuración temporal privada.');}
        console.info('Conexión Cloud sincronizada y autenticación comprobada.');
    } catch(e) {
        const error = new Error('CONFIGURACION_CLOUD: No se pudo sincronizar la conexión privada. Soporte debe revisar la configuración.');
        error.cloudSinEjecucion = true;
        throw error;
    }
}

function comprobarConexionCloud_() {
    asegurarConexionCloud_();
    const props=PropertiesService.getScriptProperties();
    const url=props.getProperty('CLOUD_RUN_URL') || CONFIG.CLOUD_RUN_URL;
    const apiKey=props.getProperty('CLOUD_RUN_API_KEY');
    if (!apiKey || !/^https:\/\/[a-z0-9.-]+\.run\.app\/generarPDF$/.test(url)) throw new Error('CONFIGURACION_CLOUD: Falta la conexión del generador.');
    const inicio=Date.now();
    const r=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',headers:{'x-api-key':apiKey},payload:'{}',muteHttpExceptions:true});
    const estado=r.getResponseCode();
    return {exito:estado===400,autenticacion:estado===400?'CORRECTA':'RECHAZADA',http:estado,duracionMs:Date.now()-inicio,motor:props.getProperty('CLOUD_PDF_MOTOR') || CONFIG.CLOUD_PDF_MOTOR};
}
