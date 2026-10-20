# Reparación de autenticación y formulario

El error `CLOUD_HTTP_401` reportado corresponde a un rechazo de autenticación, no a un límite de usuarios ni una cuota de PDF. Las pruebas previas autenticaban llamadas directas a Cloud; no acreditaban la conexión con las propiedades de Apps Script.

Se sincronizaron la URL canónica y la credencial de Cloud hacia Script Properties usando una transferencia privada de una sola aplicación, perteneciente únicamente a la cuenta publicadora. La clave no se imprimió ni se incorporó al código. La configuración se validó antes de persistirla. El transporte se retiró y eliminó después de verificar la conexión real. `CONFIG.CLOUD_CONFIG_FILE` quedó vacío, sin dependencia de archivos temporales.

Se comprobó desde el despliegue web productivo que Apps Script puede autenticarse ante Cloud. La petición de diagnóstico usa un cuerpo inválido intencionado: HTTP 400 significa que la autenticación pasó y la validación del generador rechazó los datos, sin generar PDF ni escribir registros. Una clave errónea devuelve 401. El diagnóstico devuelve únicamente estado, duración y motor, nunca credenciales.

El formulario permite elegir sugerencias o escribir una jefatura y un cargo nuevos. Las entradas manuales no disparan consultas al catálogo. Si se edita cargo o unidad mientras llega una consulta anterior, esa respuesta no sobrescribe la edición. La función de contrato ocupa todo el ancho, con un mínimo de 340 px y mayor espaciado, manteniéndose de solo lectura.

Después de un 401 HTML confirmado sin documentos, PDF, enlaces ni respuesta ambigua, se permite corregir los datos y reintentar en el mismo registro mensual con un nuevo identificador de operación. Los informes iniciados con archivos o respuestas inciertas conservan la protección contra duplicados.

Publicación: 30 archivos mediante clasp y despliegue habitual actualizado a la versión 104. Verificación automatizada: 56 pruebas aprobadas. Comprobación visual en una vista local con datos ficticios: jefatura manual, cargo no catalogado y autocompletado desde catálogo correctos.

No se generaron ni modificaron informes de funcionarios reales para esta reparación. Las credenciales Firebase/Gemini compartidas en el chat no se utilizaron; deben rotarse por su exposición.
