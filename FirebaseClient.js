/**
 * ============================================================
 * FIREBASE CLIENT
 * ============================================================
 *
 * Cliente REST para Firebase Realtime Database.
 *
 * IMPORTANTE:
 * - No contiene credenciales hardcodeadas.
 * - Las credenciales se obtienen desde Script Properties.
 * - Este módulo NO modifica todavía Sheets.
 * - Está diseñado para ser utilizado posteriormente por:
 *      Datos.js
 *      Logica.js
 *      Masivo.js
 *      TRASPASAR MES.js
 *
 * ============================================================
 */


/**
 * Obtiene la configuración de Firebase desde
 * Script Properties.
 *
 * Propiedades requeridas:
 *
 * FIREBASE_URL
 * FIREBASE_TOKEN
 */
function firebaseGetConfig_() {

  const properties =
    PropertiesService.getScriptProperties();

  const url =
    properties.getProperty('FIREBASE_URL');

  const token =
    properties.getProperty('FIREBASE_TOKEN');

  if (!url) {
    throw new Error(
      'Firebase: falta la propiedad FIREBASE_URL.'
    );
  }

  if (!token) {
    throw new Error(
      'Firebase: falta la propiedad FIREBASE_TOKEN.'
    );
  }

  return {
    url: url.replace(/\/+$/, ''),
    token: token
  };
}


/**
 * Construye una URL REST de Firebase.
 *
 * Ejemplo:
 *
 * firebaseBuildUrl_(
 *   '/funcionarios/09222054-0'
 * )
 *
 * Resultado:
 *
 * https://xxxxx.firebaseio.com/funcionarios/09222054-0.json?auth=...
 */
function firebaseBuildUrl_(path) {

  const config = firebaseGetConfig_();

  if (!path) {
    path = '/';
  }

  if (path.charAt(0) !== '/') {
    path = '/' + path;
  }

  path = path.replace(/\/+/g, '/');

  const encodedPath =
    path
      .split('/')
      .map(function(part) {
        return encodeURIComponent(part);
      })
      .join('/');

  return (
    config.url +
    encodedPath +
    '.json?auth=' +
    encodeURIComponent(config.token)
  );
}


/**
 * Realiza una petición GET.
 *
 * Retorna:
 * - objeto JavaScript
 * - null si el nodo no existe
 */
function firebaseGet_(path) {

  const url = firebaseBuildUrl_(path);

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      'Accept': 'application/json'
    }
  });

  return firebaseHandleResponse_(
    response,
    'GET',
    path
  );
}


/**
 * Crea o reemplaza completamente un nodo.
 *
 * Equivale a PUT en Firebase.
 */
function firebasePut_(path, data) {

  const url = firebaseBuildUrl_(path);

  const response = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true,
    headers: {
      'Accept': 'application/json'
    }
  });

  return firebaseHandleResponse_(
    response,
    'PUT',
    path
  );
}


/**
 * Actualiza parcialmente uno o varios nodos.
 *
 * Ejemplo:
 *
 * firebasePatch_('/', {
 *   '/registros/2026/AGOSTO/09222054-0': {...},
 *   '/registros/2026/AGOSTO/11111111-1': {...}
 * });
 *
 * Esta será una de las funciones más importantes
 * para Masivo.js.
 */
function firebasePatch_(path, data) {

  const url = firebaseBuildUrl_(path);

  const response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true,
    headers: {
      'Accept': 'application/json'
    }
  });

  return firebaseHandleResponse_(
    response,
    'PATCH',
    path
  );
}


/**
 * Elimina un nodo.
 */
function firebaseDelete_(path) {

  const url = firebaseBuildUrl_(path);

  const response = UrlFetchApp.fetch(url, {
    method: 'delete',
    muteHttpExceptions: true,
    headers: {
      'Accept': 'application/json'
    }
  });

  return firebaseHandleResponse_(
    response,
    'DELETE',
    path
  );
}


/**
 * Comprueba si existe un nodo.
 */
function firebaseExists_(path) {

  const data = firebaseGet_(path);

  return data !== null &&
         typeof data !== 'undefined';
}


/**
 * Procesa la respuesta REST de Firebase.
 */
function firebaseHandleResponse_(
  response,
  method,
  path
) {

  const statusCode =
    response.getResponseCode();

  const body =
    response.getContentText();

  if (statusCode >= 200 && statusCode < 300) {

    if (!body) {
      return null;
    }

    try {
      return JSON.parse(body);

    } catch (error) {

      throw new Error(
        'Firebase respondió con JSON inválido. ' +
        'Método: ' + method +
        ' | Ruta: ' + path +
        ' | Respuesta: ' + body
      );
    }
  }

  throw new Error(
    'Error Firebase [' +
    statusCode +
    '] ' +
    method +
    ' ' +
    path +
    ' → ' +
    body
  );
}


/**
 * ============================================================
 * UTILIDADES DE RUTAS
 * ============================================================
 */

/**
 * Normaliza un RUT para utilizarlo como clave Firebase.
 *
 * Ejemplo:
 *
 * 09.222.054-0
 * 09 222 054-0
 * 09222054-0
 *
 * → 09222054-0
 */
function firebaseRutKey_(rut) {

  if (
    rut === null ||
    typeof rut === 'undefined'
  ) {
    return '';
  }

  return String(rut)
    .trim()
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, '');
}


/**
 * Construye la ruta de un funcionario.
 */
function firebaseFuncionarioPath_(rut) {

  const rutKey =
    firebaseRutKey_(rut);

  if (!rutKey) {
    throw new Error(
      'No se puede construir ruta Firebase: RUT vacío.'
    );
  }

  return '/funcionarios/' + rutKey;
}


/**
 * Construye la ruta de un registro mensual.
 */
function firebaseRegistroPath_(
  anio,
  mes,
  rut
) {

  if (!anio) {
    throw new Error(
      'Firebase: año requerido.'
    );
  }

  if (!mes) {
    throw new Error(
      'Firebase: mes requerido.'
    );
  }

  const rutKey =
    firebaseRutKey_(rut);

  if (!rutKey) {
    throw new Error(
      'Firebase: RUT requerido.'
    );
  }

  return (
    '/registros/' +
    encodeURIComponent(String(anio)) +
    '/' +
    encodeURIComponent(String(mes).toUpperCase()) +
    '/' +
    rutKey
  );
}


/**
 * Construye la ruta de un lote.
 */
function firebaseLotePath_(loteId) {

  if (!loteId) {
    throw new Error(
      'Firebase: loteId requerido.'
    );
  }

  return '/lotes/' +
    encodeURIComponent(String(loteId));
}


/**
 * ============================================================
 * TEST / DIAGNÓSTICO
 * ============================================================
 */


/**
 * Test básico de conexión.
 *
 * Ejecutar manualmente desde Apps Script.
 */
function probarFirebase_() {

  const config =
    firebaseGetConfig_();

  Logger.log(
    'Firebase URL: ' +
    config.url
  );

  const resultado =
    firebaseGet_('/');

  Logger.log(
    JSON.stringify(
      resultado,
      null,
      2
    )
  );

  return resultado;
}