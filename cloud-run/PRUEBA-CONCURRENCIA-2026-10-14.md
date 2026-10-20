# Prueba acotada de generación Cloud

Ejecutada el 14/10/2026 contra la revisión productiva `generar-pdf-honorarios-00025-lof`. Datos completamente ficticios; sin modificaciones de registros municipales ni archivos en Drive.

Se enviaron 19 solicitudes únicas, cada una generando los dos PDF. Hubo 19 respuestas HTTP 200 con ambas cabeceras PDF válidas, sin reintentos ni errores. Las actividades alternaron entre 8, 35 y 100 párrafos. Se descartaron los bytes de PDF después de validarlos.

| Solicitudes simultáneas | Correctas | Tiempo mínimo | Tiempo máximo |
| --- | --- | --- | --- |
| 1 | 1/1 | 2,577 s | 2,577 s |
| 3 | 3/3 | 2,951 s | 6,221 s |
| 6 | 6/6 | 2,844 s | 10,312 s |
| 9 | 9/9 | 2,218 s | 6,830 s |

Resultados detallados: `output/prueba-concurrencia-cloud.json`. El programa de reproducción es `tools/probar-concurrencia-cloud.js`; toma la metadata del servicio por stdin sin escribir ni mostrar la clave API.

## Alcance e interpretación

Los tiempos incluyen transporte HTTP, espera de Cloud y renderizado de ambas versiones. No incluyen identificación, validación de nómina, reservas, registro en Sheets ni las escrituras finales de Drive mediante Apps Script. No se usaron los datos reales de funcionarios, todas las longitudes posibles de contrato, ni sesiones reales de la aplicación.

Las tandas fueron secuenciales y no se controló el estado de calentamiento de instancias; el menor tiempo de la tanda de nueve no significa que nueve solicitudes sean siempre más rápidas que seis. Es una muestra de funcionamiento bajo concurrencia, no una garantía de latencia, disponibilidad o capacidad sostenida de cierre mensual.

La aplicación conserva un límite global de tres generaciones simultáneas en Apps Script. Las solicitudes adicionales reciben indicación de ocupación y el navegador aplica espera y reintentos acotados. La prueba directa de seis y nueve peticiones Cloud supera deliberadamente ese límite para observar el renderizador por separado; no demuestra el comportamiento completo con seis o nueve usuarios en el portal.

Para certificar un objetivo de servicio debe medirse el flujo completo en un entorno de prueba con nómina y carpetas ficticias, validar cierres simultáneos y recuperación de fallos, y acordar un tiempo objetivo incluyendo espera. Una cola persistente permitiría desacoplar el proceso del navegador y de las ejecuciones de Apps Script; todavía no está implementada.
