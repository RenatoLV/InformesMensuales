# Cola PDF: implementación y activación

Estado: código local y pruebas con servicios simulados. **No desplegado ni validado con 100 usuarios reales.** El 20 de octubre, `gcloud run services describe` volvió a fallar por credenciales vencidas. Se necesita `gcloud auth login` para comprobar y modificar el proyecto `informestransparenciaactiva`.

## Qué cambia

- `COLA_PDF_ACTIVA=true` dirige las nuevas generaciones HTML a una cola persistente. Se conserva el camino anterior mientras esta propiedad no esté activada. Las recuperaciones del motor antiguo siguen su camino original.
- La aceptación guarda primero un JSON privado en Drive y un control en el registro mensual. Libera la reserva corta de Apps Script y responde “en cola”. Un envío Cloud incierto se recupera desde ese outbox.
- Cloud API persiste una solicitud inmutable en un bucket privado y un estado pequeño en Firestore. Cloud Tasks lleva únicamente el identificador, sin nómina ni documentos.
- El trabajador comprueba identidad OIDC, toma una reserva mediante escritura condicional, genera los dos PDF y conserva el resultado en el bucket. Una tarea duplicada, un reinicio o una respuesta perdida no generan nuevos archivos de Drive. Si cae **durante** el render antes de persistir los bytes, ese render puede repetirse.
- Un único activador de Apps Script revisa hasta 50 operaciones por ciclo, consulta estados en una llamada, recupera envíos pendientes y guarda los PDF usando IDs de Drive previamente asignados. Actualiza Sheets solo después de guardar ambos. Procesa con cursor circular y se detiene aproximadamente a los 210 segundos.
- Sheets sigue siendo la autoridad de exclusión por RUT/mes/año. Una generación pendiente bloquea otra generación con datos diferentes y bloquea una carga manual rival. Los errores terminales requieren revisión y conservan ese bloqueo.
- La pantalla libera el formulario después de aceptar. Consulta comprobantes agrupados cada 60–65 segundos, pausa consultas cuando la pestaña está oculta y recupera seguimiento al recargar la misma sesión. Al cerrar definitivamente una pestaña se puede perder el comprobante local, pero el registro mensual y la generación permanecen en el servidor.
- El estado usa caché; ante una pérdida de caché busca el comprobante en la columna de control. No consulta nómina ni ejecuta Chromium. El reconciliador no lee Sheets cuando no hay pendientes.
- La nómina conserva su índice compartido y caché de filas. Se añade una caché de metadata de 60 segundos para evitar abrir Sheets durante reintentos/entregas cercanos. Junto con los 5 minutos existentes de filas, los cambios de nómina pueden tardar aproximadamente 6 minutos en reflejarse.
- Los PDF manuales siguen entrando por recepción masiva, sin generación ni consumo de Chromium.

## Objetivo de USD 5/mes

Supuesto: cada “informe” es **un par** remuneraciones + transparencia; 1 vCPU, 1 GiB, facturación por solicitud, 30 segundos facturados por par, región `us-central1`.

| Pares mensuales | CPU + RAM antes del tramo gratuito |
|---|---:|
| 1.500 | USD 1,19 |
| 1.853 | USD 1,47 |
| 2.000 | USD 1,59 |
| 2.000 a 60 segundos | USD 3,18 |

Fórmula: pares × segundos × (0,000024 + 0,0000025). Es **solo render**, no la factura completa. Cloud Run contempla 180.000 vCPU-segundos y 360.000 GiB-segundos gratuitos mensuales compartidos por cuenta de facturación. No asumir que están disponibles si otros proyectos los consumen.

Faltan solicitudes y tiempo del API, arranques, intentos repetidos, Firestore, operaciones/almacenamiento/transferencia del bucket, Secret Manager, registros, builds, Artifact Registry y cualquier servicio antiguo encendido. También cuenta el almacenamiento de Drive contratado. Las capas gratuitas pueden reducir mucho el importe; USD 5 es un objetivo razonable para este volumen, **no un techo garantizado**.

Medidas de coste:

1. `min-instances=0` tanto en API como worker y también revisar el servicio antiguo. Usar facturación por solicitud (`--cpu-throttling`).
2. Trabajador: 1 vCPU, 1 GiB, concurrencia 1, máximo 5 instancias. Cloud Tasks: máximo 5 tareas simultáneas, 1 despacho/segundo, 8 intentos, reintentos entre 30 y 600 segundos, duración máxima 24 horas.
3. API: 1 vCPU, 256 MiB iniciales, concurrencia 20, máximo 3 instancias. Medir memoria antes de publicar: devuelve resultados base64 y puede necesitar 512 MiB para PDFs grandes.
4. Objetos temporales con ciclo de vida de 7 días. Considerar también retención, versiones y borrado reversible del bucket; una regla Delete no elimina costes de versiones retenidas. No aplicar estas reglas al archivo definitivo de Drive.
5. TTL Firestore en `expiresAt`, 30 días. Excluir el campo `json` de índices si la política del proyecto lo permite. No guardar bytes PDF en Firestore.
6. No registrar formularios, RUT, correos, payloads, claves ni bytes PDF en logs.
7. Alertas de presupuesto a USD 3/4/5. Son avisos, **no cortan la facturación**. Revisar gasto diario durante el primer cierre mensual y mantener margen para reintentos.

Fuentes verificadas el 20/10/2026:

- [Cloud Run: precios y tramo gratuito](https://cloud.google.com/run/pricing)
- [Cloud Tasks: precios por operaciones](https://cloud.google.com/tasks/pricing)
- [Apps Script: cuotas vigentes](https://developers.google.com/apps-script/guides/services/quotas)

## Capacidad y límite que todavía hay que medir

Con cinco trabajadores y 30 segundos por par: hasta unos 10 pares/minuto en régimen continuo; 20 pares requieren aproximadamente 2 minutos de render y 100 unos 10 minutos, más arranque, espera del reconciliador y escritura en Drive. 1.853 pares juntos: unas 3 h 6 min de render ideal. Esto no significa que 100 usuarios navegando ejecuten 100 renderizadores.

La última etapa todavía usa Apps Script/Drive/Sheets. Esta implementación evita gastar 30 segundos de activador por render, pero **no elimina sus cuotas**. La documentación de Apps Script distingue 90 minutos diarios de activadores en cuentas de consumidor y 6 horas en Workspace; también hay límites diarios de URL Fetch y ejecuciones. Antes de prometer recepción completa de 2.000 informes en un día:

- Confirmar el tipo de cuenta que instala el activador.
- Medir duración p95 de descargar/subir/registrar un par y duración diaria del activador.
- A 2.000 pares, 10 segundos por finalización ya equivalen a unas 5 h 33 min, sin contar reconciliación. Si el margen no alcanza, mover esa finalización a un worker con acceso a **unidad compartida** y un escritor de Sheets por lotes; no atribuir a una cuenta de servicio capacidad de almacenar en My Drive sin resolver identidad y permisos.

Por ello este es un incremento utilizable tras validar cuotas, no la migración completa del plan Firestore/Sheets como proyección. Mantiene deliberadamente una única reserva mensual en Sheets; evita dos autoridades contradictorias durante la transición.

## Recursos y permisos para activar

Preparar en la misma región:

- Bucket exclusivo temporal con acceso uniforme y prevención de acceso público. Aplicar `cloud-run/cola-lifecycle.json` después de revisar retención/borrado reversible.
- Firestore Native, base `(default)` o indicar `PDF_DATABASE`. Habilitar TTL en `pdf_jobs.expiresAt`. Sin acceso público desde clientes.
- Cola Cloud Tasks `pdf-informes`, con los límites anteriores. Crear pausada durante instalación.
- Cuenta de ejecución API: permisos sobre documentos Firestore, lectura/creación de objetos del bucket, encolar tareas y `iam.serviceAccounts.actAs` **sobre la cuenta de tareas concreta**.
- Cuenta worker: permisos sobre documentos Firestore y lectura/creación de objetos del mismo bucket. No necesita escribir en Drive.
- Cuenta de tareas: invocar exclusivamente el worker. El agente de servicio Cloud Tasks debe poder emitir su token OIDC conforme a la configuración de Google Cloud.
- API y worker leen `API_KEY` desde Secret Manager. La API usa la misma clave servidor que Apps Script. Nunca colocarla en HTML, Git o comandos en texto.
- Worker sin acceso anónimo (`--no-allow-unauthenticated`), además de validar OIDC en código. API accesible a Apps Script por HTTPS y protegida por la clave exacta.

Ambos servicios usan la imagen construida con `cloud-run/Dockerfile`. No se añadieron dependencias; `googleapis` existente proporciona Firestore, Storage y Tasks.

Variables de entorno de ambos servicios:

```text
GOOGLE_CLOUD_PROJECT=informestransparenciaactiva
PDF_BUCKET=<bucket privado temporal>
PDF_DATABASE=(default)
PDF_TASK_QUEUE=projects/informestransparenciaactiva/locations/us-central1/queues/pdf-informes
PDF_WORKER_URL=<URL canónica HTTPS del worker, sin barra final>
PDF_TASK_SERVICE_ACCOUNT=<cuenta de tareas>@informestransparenciaactiva.iam.gserviceaccount.com
PDF_ROLE=api               # worker en el otro servicio
API_KEY=<referencia a Secret Manager, no valor en archivo>
```

La URL del worker debe coincidir exactamente con la audiencia OIDC y destino de Tasks. Se puede crear inicialmente el worker con la cola pausada y actualizar esa variable tras obtener su URL. La configuración incompleta impide arrancar.

Parámetros de Cloud Run previstos:

```text
API:    --cpu=1 --memory=256Mi --concurrency=20 --min-instances=0 --max-instances=3 --timeout=120 --cpu-throttling
Worker: --cpu=1 --memory=1Gi  --concurrency=1  --min-instances=0 --max-instances=5 --timeout=300 --cpu-throttling --no-allow-unauthenticated
```

Cloud Tasks:

```text
--max-concurrent-dispatches=5
--max-dispatches-per-second=1
--max-attempts=8
--min-backoff=30s
--max-backoff=600s
--max-retry-duration=86400s
```

La aplicación también limita a 8 intentos y 24 horas aunque el reconciliador cree otra tarea para recuperar una entrega agotada. Los nombres de tarea se deduplican en ventanas de cinco minutos y las reservas Firestore protegen entre ventanas.

## Apps Script y secuencia de puesta en marcha

1. Crear una carpeta **privada** para el outbox, accesible únicamente al propietario/operadores necesarios. Contiene datos personales y laborales. No usar una carpeta de transparencia ni una carpeta pública.
2. Guardar propiedades `COLA_PDF_URL` (servicio API), `COLA_PDF_OUTBOX_FOLDER_ID` y la clave `CLOUD_RUN_API_KEY` existente. Mantener `COLA_PDF_ACTIVA=false`.
3. Publicar los nuevos archivos Apps Script, incluyendo `ColaPDF.js` y `JS_COLA_PDF.html`. El manifiesto añade `script.scriptapp` para instalar el activador; el propietario deberá autorizar ese alcance.
4. Con Cloud configurado y cola reanudada, ejecutar un caso de prueba controlado desde un despliegue de pruebas. Ejecutar `activarColaPDF_` desde el editor instala un solo activador de un minuto, comprueba acceso al outbox/API y activa el modo cola. Esta función es privada para RPC del navegador.
5. Verificar el par correcto, transparencia censurada, fila mensual única y permisos de ambos archivos. Probar cierre de pestaña, respuesta perdida, error temporal de Drive y recuperación.
6. Ejecutar prueba real escalonada: 5, 20 y 100 solicitudes; comprobar las cuotas y memoria antes de habilitar al conjunto de usuarios.
7. Solo después activar en producción. No modificar a ciegas el servicio antiguo: primero comprobar tráfico/revisiones y mantener compatibilidad con operaciones ya empezadas.

## Operación y recuperación

- `EN COLA`: aceptado y persistido. No es un PDF generado todavía.
- `GENERADO (PENDIENTE FIRMA)`: ambos PDF guardados en Drive y fila confirmada.
- `COLA REQUIERE REVISION`: ocho intentos, plazo de 24 h o resultado temporal vencido. Bloqueo mensual conservado; revisar causa antes de autorizar una nueva operación.
- Desactivar nuevas entradas: `COLA_PDF_ACTIVA=false`. Dejar URL y activador mientras haya pendientes. Pausar Tasks solo para mantenimiento; se conserva outbox, pero el plazo de 24 horas sigue aplicando.
- Ante un activador detenido, corregir autorización/cuota, comprobar que exista uno solo y ejecutar `reconciliarColaPDF_`. Para recuperar una señal de pendientes perdida, fijar `COLA_HAY_PENDIENTES=true`.
- No borrar controles, cambiar RUT/periodo ni cambiar el ID de operación para “destrabar” un informe: primero comprobar archivos, estado Cloud y reserva mensual.
- Los resultados Cloud duran 7 días; el JSON outbox de Drive se manda a la papelera al finalizar. Los pendientes con error se conservan para revisión. Revisar periódicamente errores y outbox huérfanos.

## Validación local

`node --test tests/*.test.js`: **92 pruebas aprobadas**. Cubre cola durable simulada, compare-and-swap, duplicados concurrentes, fencing de trabajador antiguo, reinicio con resultado persistido, reparación del outbox, ocho intentos, expiración, 100 trabajos con cinco consumidores simulados, recepción sin render, bloqueo con cargas manuales, subida parcial de Drive, reconciliación sin navegador, caché de estado y seguimiento de navegador/lotes.

Se instalaron las dependencias bloqueadas y se comprobó que el cliente `googleapis` expone los métodos usados de Firestore, Storage y Tasks. Las pruebas locales se ejecutaron en Node 24; el contenedor conserva Node 22 y falta verificar su imagen desplegada.

Estas pruebas validan comportamiento del código; no certifican IAM, cuotas, latencia, memoria, compatibilidad de los servicios desplegados ni factura real. Esos puntos requieren la fase de pruebas con Google Cloud autenticado.
