# Plan de capacidad: 100 usuarios y picos de 10–20 solicitudes

Fecha: 20 de octubre de 2026. Propuesta de implementación; no modifica producción.

**Plan principal actualizado:** [Operación y costes para 1.853 honorarios](PLAN_OPERACION_1853_HONORARIOS_2026-10-20.md). Esa revisión amplía este diseño a entrega de firmados, cargas manuales, prioridades, costes y pruebas del flujo completo. Usar sus parámetros y etapas para la implementación; este documento se conserva como antecedente.

## Objetivo y alcance

Recibir solicitudes de 100 usuarios, con picos de 10–20 generaciones simultáneas, conservando cada trabajo aunque se cierre el navegador. Una generación corresponde a un informe mensual con dos PDF: remuneraciones y transparencia. Los cálculos presuponen 30 segundos para completar ambos, incluido almacenamiento; debe medirse de nuevo después de migrar.

No confundir tres magnitudes: personas conectadas, generaciones simultáneas y consumo de las cuotas de Google. Registrar las tres por separado. Las metas siguientes son criterios propuestos de aceptación, no capacidad certificada.

## Situación comprobada en el código local

- `Main.js`: tres generaciones y cuatro subidas simultáneas globales.
- `Concurrencia.js`: reservas con Script Properties y registro en Sheets bajo ScriptLock. No existe una cola persistente.
- `JS_SOLICITUDES.html`: hasta siete reintentos por ocupación, dependientes de la pestaña abierta.
- `Logica.js`: el motor HTML envía datos a Cloud; Apps Script recibe los PDF, los almacena y actualiza el historial.
- `cloud-run/optimizado/index.js`: una generación activa por proceso, con Drive readonly. El valor por defecto de tres en `app.js` está sobrescrito por `maxActivas:1`.
- `cloud-run/optimizado/app.js`: deduplicación en memoria y caché de dos minutos. No protege una repetición en otra instancia o tras reiniciar el contenedor.
- La prueba del 14 de octubre llegó a nueve peticiones concurrentes directamente a Cloud; no certifica el flujo completo. No se inspeccionó en esta planificación la configuración activa del proyecto Cloud.

## Arquitectura propuesta

Portal → API de recepción → Firestore + evento pendiente → Cloud Tasks → worker Cloud Run → Drive.

Firestore mantiene el estado operacional. Un sincronizador separado proyecta los registros en Sheets para administración. El portal consulta el estado en Cloud, sin consultar Sheets por cada espera.

1. La API autentica y autoriza al solicitante, valida el periodo y los datos y reserva una clave por persona/año/mes mediante transacción. Una repetición devuelve el mismo trabajo. Una corrección usa un procedimiento explícito de versión.
2. La misma transacción guarda el trabajo y un evento de despacho pendiente. Un despachador crea una tarea con nombre determinista y marca el evento. Un reconciliador repara eventos pendientes: guardar en Firestore y crear una tarea no constituyen una sola transacción.
3. Cloud Tasks entrega únicamente el identificador del trabajo al worker privado, autenticado mediante OIDC/IAM. Los datos personales permanecen en almacenamiento con acceso restringido.
4. El worker obtiene un lease transaccional con vencimiento y control de versión. Guarda puntos de recuperación persistentes. Un reintento o entrega duplicada reutiliza el trabajo y sus archivos; un worker cuyo lease perdió vigencia no puede confirmar el resultado.
5. Genera los dos PDF con el motor HTML existente y los guarda directamente en Drive. Reservar y persistir IDs antes de subir; verificar y reutilizar cada ID en una recuperación. No devolver base64 a Apps Script.
6. Confirma en una transacción el estado y un evento de sincronización a Sheets. Solo reconoce el éxito de la tarea tras persistir el resultado. Un fallo de Sheets queda como sincronización pendiente y no repite la generación PDF.
7. El portal muestra recibido, en espera, generando, completado o requiere revisión. Ofrece consultar el resultado al volver a ingresar. Para evitar que cien sondeos vuelvan a saturar Apps Script, el estado se obtiene mediante API autenticada directa o listeners autorizados; un proxy Apps Script solo se admite si se mide y limita su tráfico.

Antes de las escrituras desde Cloud, comprobar el destino Drive: unidad compartida o identidad de usuario autorizada. La cuenta de servicio actual de solo lectura no habilita esa operación. No asumir que una cuenta de servicio pueda ser propietaria de archivos en Mi unidad.

## Configuración inicial de ensayo

Separar la API rápida del worker que ejecuta Chromium.

| Componente | Punto de partida propuesto |
| --- | --- |
| Worker Cloud Run | Una petición y una generación por instancia |
| CPU y memoria | Ensayar 1 vCPU/1 GiB y 2 vCPU/2 GiB; escoger por duración, memoria y coste medidos |
| Escala | Hasta 5 instancias en la primera etapa; ensayar 10 después |
| Instancias mínimas | 0 fuera de horario; evaluar 1 en cierre mensual si el arranque afecta la meta |
| Cloud Tasks | Máximo 5 despachos concurrentes, tasa inicial de 1 despacho/s |
| Reintentos | Espera exponencial con variación; empezar con 10 intentos y ventana de 1 hora; alerta y recuperación supervisada al agotarse |
| Tiempo por intento | Ensayar presupuesto de 180 s y alinear timeout de Cloud Run, deadline de Tasks y lease; renovar o dimensionar el lease para evitar solapamientos |
| Sincronización Sheets | Un escritor, lote cada 15–30 s; reintentos y conciliación independientes |

La tasa de despacho y la concurrencia se ajustan a Drive y a la duración observada. Los límites de instancias no sustituyen el control de despachos ni un presupuesto de gasto. Errores permanentes de datos requieren marcar revisión y detener la repetición; errores transitorios permiten reintento. Registrar también trabajos sin terminar tras agotarse los intentos.

Subir únicamente `MAX_GENERACIONES` no elimina el límite de ejecuciones de Apps Script ni la contención de Sheets. Tras migrar, sustituir la reserva de generación por la admisión persistente; mantener controles separados para adjuntos y otros flujos aún no migrados.

## Capacidad estimada

Tiempo ideal de vaciado de un pico: `ceil(solicitudes / generaciones efectivas simultáneas) × 30 s`.

| Generaciones efectivas | Capacidad ideal por minuto | Pico de 20 | Pico de 100 |
| --- | --- | --- | --- |
| 3 | 6 | 3 min 30 s | 17 min |
| 5 | 10 | 2 min | 10 min |
| 10 | 20 | 1 min | 5 min |

No incluyen arranques, reintentos ni degradación de servicios. Diez instancias configuradas no garantizan diez trabajadores disponibles inmediatamente. Cinco workers son un primer objetivo razonable para un pico breve de veinte; si llegan veinte trabajos nuevos cada minuto sostenidamente, cinco no alcanzan y diez quedan sin margen. En ese caso dimensionar con holgura a partir de la tasa de llegada y mediciones reales.

## Sheets y registro de cuotas

Conservar `REGISTRO_HISTORICO` y sus columnas actuales. La columna W puede mantener un resumen compatible, pero Firestore pasa a ser la fuente de estado para el flujo migrado. Un único sincronizador escribe actualizaciones agrupadas con Sheets API; conserva una clave estable por periodo y verifica identidad si las filas cambian de posición. No usar append sin deduplicación.

Crear dos pestañas adicionales:

- `CONTROL_TRABAJOS`: operationId, periodo, persona autorizada, estado, recibido, iniciado, terminado, espera, duración, intentos, enlaces a los dos PDF, error resumido y estado de sincronización. Acceso administrativo; sin claves, tokens ni contenido médico.
- `RESUMEN_CAPACIDAD`: por intervalo/día, trabajos recibidos, en cola, activos, completados, fallidos, edad del pendiente más antiguo, latencias p50/p95, reintentos, errores 429 y 5xx, llamadas de lectura/escritura a Sheets y llamadas a Drive.

Contar un informe completado por trabajo y dos PDF por trabajo; distinguirlo del número de llamadas API y de las subidas de archivos firmados. Los contadores internos describen solo el tráfico instrumentado, no la cuota restante de toda la cuenta. No existe un contador universal de «registros restantes» que equivalga a todas las cuotas de Google.

Para Sheets API, Google publica presupuestos separados de lectura y escritura de 300 solicitudes/minuto/proyecto y 60/minuto/usuario/proyecto. Agrupar muchas filas en pocas solicitudes y limitar el escritor. Esos valores no se trasladan directamente a cada llamada de SpreadsheetApp ni aseguran que el contenido de un lote sea ilimitado.

Medir cuotas y uso disponibles en Cloud Monitoring/Service Usage, junto con métricas propias del servicio. Alertas iniciales: pendiente más antiguo >2 min, sincronización >2 min de retraso, errores >1 % en una ventana con muestra suficiente y consumo >70 % de una cuota cuyo uso/límite esté realmente disponible. Los umbrales se calibran durante ensayo. Añadir presupuesto y alertas de coste; una alerta de presupuesto no detiene automáticamente el gasto.

## Orden de ejecución y aceptación

1. Instrumentar sin cambiar el procesamiento: tiempos de admisión, render, Drive y Sheets; tasa de llegadas, tamaño PDF, CPU y memoria. Revisar configuración activa, cuotas, permisos Drive y método de identidad institucional.
2. Implementar Firestore, recepción, outbox de despacho, cola, worker idempotente y conciliadores en entorno de ensayo. Reutilizar la plantilla HTML ya implementada.
3. Añadir almacenamiento directo en Drive, sincronizador Sheets y consulta de estado persistente en el portal. Evitar que convivan dos generadores escribiendo el mismo periodo durante la transición.
4. Probar 1, 5, 10, 20 y 100 solicitudes con datos ficticios, y cien sesiones consultando/escribiendo. Medir también llegada sostenida. Simular cierre de pestaña, reinicio de worker, tarea duplicada en distintas instancias, caída tras guardar cada PDF, falta de permisos Drive y Sheets temporalmente indisponible.
5. Metas iniciales propuestas: recepción p95 <3 s; pico de veinte completado en <3 min con cinco workers efectivos; cien solicitudes aceptadas quedan consultables; cero duplicados en los escenarios de recuperación; todo trabajo termina o muestra un error accionable; Sheets converge sin repetir PDF. Revisar las metas si el nuevo flujo tarda más de 30 s.
6. Desplegar gradualmente tras las pruebas. Seleccionar el flujo por cohorte o bandera persistida en cada trabajo: cada periodo pertenece a un solo motor. Revertir detiene nuevas admisiones al flujo nuevo, pero conserva y drena sus trabajos pendientes antes de cualquier migración manual.

## Documentación oficial

- Cloud Tasks, límites y reintentos: https://docs.cloud.google.com/tasks/docs/configuring-queues
- Cloud Run con tareas asíncronas: https://docs.cloud.google.com/run/docs/triggering/using-tasks
- Concurrencia de Cloud Run: https://docs.cloud.google.com/run/docs/about-concurrency
- Límites de Sheets API: https://developers.google.com/workspace/sheets/api/limits
- Arquitectura local previa: `docs/ARQUITECTURA.md`. Este plan actualiza su propuesta teniendo en cuenta que la plantilla HTML ya está implementada.
