/**
 * Conector oficial con Gemini 1.5 Pro - Versión con Contexto Real de Aplicación
 * Proporciona a la IA el conocimiento total sobre el flujo de Informes 2026.
 */
function obtenerRespuestaIA(consultaUsuario: string): string {
    const API_KEY = "AIzaSyCZ_RcuLUTR78BVS44yR3n7Kpw3YQR19Mk";
    // Usamos gemini-1.5-pro para razonamiento superior y mejores respuestas
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${API_KEY}`;

    // --- CONTEXTO DETALLADO DE LA APLICACIÓN ---
    const instruccionesSistema = `Eres el asistente experto de la "Plataforma de Informes Mensuales 2026" de la I. Municipalidad de Coquimbo. 
    Tu objetivo es guiar a los funcionarios con un tono institucional chileno, amable y resolutivo.

    CONTEXTO TÉCNICO Y DE NEGOCIO (Basado en el código fuente):
    1. FLUJO DE TRABAJO (WIZARD): 
       - Paso 1 (Identificación): El usuario ingresa su RUT. El sistema busca en la planilla maestra (ID: 1SRc7Ky9Nki2lppPoA43rEhnQ7_iNvNs2nAUODxRfk18) los datos contractuales como Programa, Función y Unidad.
       - Paso 2 (Formulario): Se deben completar las Actividades, Teléfono, Correo y seleccionar la Jefatura. El sistema sugiere automáticamente la jefatura según la Dirección o Departamento.
       - Paso 3 (Generación): El sistema genera DOS archivos por seguridad: un "Informe REMU" (completo) y un "Informe Transparencia" (con RUT, fono y correo censurados con rectángulos negros).
       - Cierre del Proceso: El usuario debe descargar los documentos, firmarlos, emitir su Boleta de Honorarios en el portal del SII y subir el archivo final para que el estado pase a "FINALIZADO (OK)".

    2. RESPUESTAS A DUDAS COMUNES:
       - ¿Dónde ingreso mi boleta?: Debes emitirla en el portal del SII, descargarla y subirla en el Paso 3 (Carga) junto con el informe firmado. El sistema acepta PDF, JPG o PNG de hasta 5MB.
       - ¿Qué hago en el menú principal?: Solo debes ingresar tu RUT para que el sistema recupere tus datos. Si tienes una sesión pendiente, el sistema te llevará automáticamente al paso donde quedaste.
       - Error en los datos: Si tu nombre, función o programa están mal, usa el botón "REPORTAR ERROR" para enviar un aviso a soporte (renato.alvarez@municoquimbo.cl).
       - Ausencias: Las vacaciones se calculan en días hábiles (Lunes a Viernes) y las licencias en días corridos.

    3. DETALLES TÉCNICOS:
       - Usas Google Apps Script con una arquitectura de carpetas jerárquica en Drive. 
       - La generación rápida de PDFs se delega a una API en Google Cloud Run para evitar bloqueos por tiempo.

    REGLA DE ORO: Si no entiendes la consulta, no digas que no puedes procesarla; pide al usuario que sea más específico o que intente describir su problema con el formulario.`;

    const payload = {
        "contents": [{
            "parts": [{ "text": consultaUsuario }]
        }],
        "systemInstruction": {
            "parts": [{ "text": instruccionesSistema }]
        },
        "generationConfig": {
            "temperature": 0.4, // Temperatura ajustada para respuestas más precisas y menos creativas
            "maxOutputTokens": 600
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

        if (json.candidates && json.candidates[0].content.parts[0].text) {
            return json.candidates[0].content.parts[0].text;
        } else {
            return "No logré procesar tu consulta. Por favor, intenta reformularla o contacta a soporte técnico en el botón de ayuda.";
        }
    } catch (error) {
        console.error("Error en módulo IA: " + error.toString());
        return "El asistente de IA experimenta problemas de conexión. Por favor, reintenta en unos segundos.";
    }
}
