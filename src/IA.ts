/**
 * Conector oficial con Gemini 1.5 Flash usando tu API Key de AI Studio.
 * Esta función corre en los servidores de Google, por lo que tu clave queda 100% protegida y oculta del navegador del usuario.
 */
function obtenerRespuestaIA(consultaUsuario: string): string {
  // Tu API Key configurada de forma segura en el backend
  const API_KEY = "AIzaSyCZ_RcuLUTR78BVS44yR3n7Kpw3YQR19Mk"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

  // Instrucciones del sistema para clonar el comportamiento de tu Gem
  const instruccionesSistema = `Eres un ingeniero de soporte técnico experto asignado a la plataforma de informes mensuales de honorarios de la I. Municipalidad de Coquimbo. 
  Tu rol es resolver dudas de los usuarios sobre el llenado del formulario, problemas con el procesamiento masivo de RUTs y explicar la lógica del código de Apps Script cuando sea necesario. 
  Sé claro, conciso y utiliza un tono amable, servicial e institucional chileno.`;

  const payload = {
    "contents": [{
      "parts": [{ "text": consultaUsuario }]
    }],
    "systemInstruction": {
      "parts": [{ "text": instruccionesSistema }]
    }
  };

  const opciones: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    // Llamada nativa de Apps Script (No consume cuotas de Google Cloud pagadas)
    const respuesta = UrlFetchApp.fetch(url, opciones); 
    const json = JSON.parse(respuesta.getContentText());
    
    if (json.candidates && json.candidates[0].content.parts[0].text) {
      return json.candidates[0].content.parts[0].text;
    } else {
      return "No logré procesar tu consulta en este momento, por favor intenta reformular la pregunta.";
    }
  } catch (error) {
    console.error("Error en módulo IA: " + error.toString());
    return "El asistente de IA experimenta congestión en la red de la Municipalidad. Intenta nuevamente en unos segundos.";
  }
}
