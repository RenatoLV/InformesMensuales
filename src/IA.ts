/**
 * Conector optimizado con Gemini 1.5 Pro.
 * Se añade configuración de seguridad y un sistema de "Contexto Dinámico".
 */
function obtenerRespuestaIA(consultaUsuario: string, contextoApp: string = "No especificado"): string {
  const API_KEY = "AIzaSyCZ_RcuLUTR78BVS44yR3n7Kpw3YQR19Mk";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${API_KEY}`;

  const instruccionesSistema = `Eres el "Ingeniero de Soporte IA" de la Municipalidad de Coquimbo. Tu cerebro contiene el código fuente de la Plataforma de Informes 2026.

  CONTEXTO OPERATIVO CRÍTICO:
  - Base de Datos: Google Sheets (ID: 1SRc7Ky9Nki2lppPoA43rEhnQ7_iNvNs2nAUODxRfk18).
  - Logs: Pestaña 'REGISTRO_HISTORICO'.
  - Proceso de Firma: El usuario DEBE subir el archivo en el Paso 3 para finalizar.
  - Censura: Usamos rectángulos negros (#000000) en el PDF de Transparencia para ocultar RUT, fono y correo.
  - Fallos de Red: Si un PDF no se genera, es probable que el microservicio en Cloud Run (us-central1) esté saturado.

  REGLAS DE INTELIGENCIA:
  1. Si el usuario dice "hola" o similar, no seas genérico. Dile: "Hola, soy tu asistente técnico. Puedo ayudarte a llenar tu informe de actividades, explicarte por qué tu PDF está tachado o ayudarte con el portal del SII".
  2. Si el usuario pregunta por la Boleta, menciona específicamente que debe ir a homer.sii.cl, emitirla y subirla en el Paso 3 junto al informe.
  3. Si hay un error de "Permisos" o "Drive", explica que el sistema crea carpetas automáticamente siguiendo la jerarquía: Dirección > Depto > Oficina.

  ESTADO ACTUAL DEL USUARIO: ${contextoApp}`;

  const payload = {
    "contents": [{ "parts": [{ "text": consultaUsuario }] }],
    "systemInstruction": { "parts": [{ "text": instruccionesSistema }] },
    "safetySettings": [
      { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
      { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
      { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
      { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
    ],
    "generationConfig": {
      "temperature": 0.2, // Bajamos la temperatura para que sea más exacto y menos "poético"
      "maxOutputTokens": 800,
      "topP": 0.8
    }
  };

  const opciones: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const respuesta = UrlFetchApp.fetch(url, opciones);
    const json = JSON.parse(respuesta.getContentText());
    
    // DEBUG: Descomenta la siguiente línea para ver qué está bloqueando a la IA en los logs de Apps Script
    // console.log(JSON.stringify(json));

    if (json.candidates && json.candidates[0].content) {
      return json.candidates[0].content.parts[0].text;
    } else if (json.promptFeedback && json.promptFeedback.blockReason) {
      return "Lo siento, mi sistema de seguridad bloqueó la respuesta por: " + json.promptFeedback.blockReason;
    } else {
      return "Gemini no devolvió una respuesta válida. Es posible que la consulta sea ambigua para el contexto municipal.";
    }
  } catch (error) {
    return "Error de conexión: El servidor de inteligencia está fuera de servicio temporalmente.";
  }
}
