# Estado de publicación y cuentas

## Actualización: Cloud publicado el 20/10/2026

La reautenticación de direccionrrhh permitió completar la publicación de Cloud. La revisión `generar-pdf-honorarios-00029-huw` recibe el 100 % del tráfico. Imagen: `us-central1-docker.pkg.dev/informestransparenciaactiva/cloud-run-source-deploy/generar-pdf-honorarios@sha256:0b4ba81a5152513e87fdabb2b2e8aee402120edc9da99f27e94679cc7b94e7fb`. Build: `cbd4de14-2490-4e6d-a16c-92e4e30b0ff9`.

Se conservó la configuración real consultada antes de publicar: 1 CPU, 1 GiB, concurrencia 1 por instancia, mínimo 1, máximo 20, startup CPU boost ya habilitado y la identidad pdf-uploader-bot. No se crearon recursos de cola. El modo de recursos separados sigue desactivado por defecto. Las etiquetas temporales html-prueba y opt-prueba se retiraron después de activar la revisión; la URL habitual continúa siendo la misma.

Validación: 95 pruebas locales correctas; autenticación sin clave devuelve 401; generación de ambos PDF HTML y compatibilidad Docs correctas en la candidata y después en la URL habitual. Comparación con PDF ficticios obtenidos de 00027-vel: ambas versiones de dos páginas, texto idéntico y diferencia media de píxeles cero en las cuatro páginas. Privacidad pública verificada por extracción de texto e inspección visual. La llamada HTML a la candidata tardó 7521 ms; la comprobación posterior en la URL habitual, 5137 ms. Son observaciones individuales, sin Apps Script ni guardado en Drive; no demuestran una mejora de latencia ni capacidad bajo carga.

Para revertir Cloud: `gcloud run services update-traffic generar-pdf-honorarios --project=informestransparenciaactiva --region=us-central1 --to-revisions=generar-pdf-honorarios-00027-vel=100`.

Apps Script no se publicó en esta operación. Los apartados siguientes registran el bloqueo anterior y el procedimiento inicialmente pendiente; su estado de Cloud queda sustituido por esta actualización. Mantener COLA_PDF_ACTIVA desactivada hasta configurar y validar su infraestructura.

Solicitud autorizada: publicar optimizaciones sin aumentar recursos de Cloud, hacer clasp push y actualizar el despliegue habitual para pruebas.

## Identidades

- Google Cloud: `direccionrrhh@municoquimbo.cl`. Confirmada como cuenta activa/configurada de gcloud.
- Apps Script y Drive: `renato.alvarez@municoquimbo.cl`. Coincide con el correo del ID token guardado por clasp. La consulta remota de identidad sigue pendiente por conectividad; no se imprimieron tokens ni claves.
- Proyecto Cloud: `informestransparenciaactiva`, región `us-central1`, servicio `generar-pdf-honorarios`.
- Script: `1t_mvD91LaiG5mWlQDi5rClwYy2ot6T2I27AHsihxTY5Ph5VOY9gCM4iY`.
- Despliegue web habitual documentado: `AKfycbzICQboJLuqLaKGKs8lh8QYZRWSAtziAprezFCkwv0Ayu3EZXTyYokP1pLbJQlKhCm6`. Confirmar versión actual con clasp antes de modificarlo.

Las identidades son independientes. No cambiar la cuenta de clasp a la de Cloud ni mover la propiedad de Drive para publicar.

## Bloqueo observado

Las llamadas a oauth2.googleapis.com, script.googleapis.com y run.googleapis.com fallaron con ECONNRESET, ConnectionResetError 10054 o timeout. También fallaron pruebas sin credenciales. www.google.com sí respondió. No es evidencia de que ambas herramientas deban usar una misma cuenta.

No se ejecutó push ni se modificó tráfico, recursos o despliegues. El listado remoto y el respaldo previo no pudieron obtenerse. La prueba local completa terminó con 95 pruebas aprobadas.

## Orden de continuación al recuperar conexión

1. Confirmar cuenta Cloud con `gcloud auth list` y cuenta Apps Script con `clasp.cmd show-authorized-user`.
2. Obtener metadata del servicio sin imprimir variables de entorno ni secretos. Registrar imagen, revisión, tráfico y recursos previos.
3. Ejecutar `clasp.cmd deployments` y clonar el código remoto en una carpeta nueva dentro de output para respaldo. Comparar con los archivos locales antes de subir.
4. Construir una nueva etiqueta de la imagen en el repositorio existente y desplegar una revisión sin tráfico, conservando CPU, RAM, instancias mínimas/máximas, identidad y secretos. No habilitar CPU boost, nuevas instancias mínimas ni servicios de cola.
5. Comprobar autenticación, ambas versiones PDF y conservación del formato con datos ficticios contra la revisión nueva. Seleccionar explícitamente su etiqueta, evitando probar una etiqueta antigua.
6. Pasar tráfico a la revisión verificada. Conservar la revisión anterior para reversión.
7. Ejecutar `clasp.cmd push --force` una vez verificado el respaldo; crear versión con `clasp.cmd version` y actualizar únicamente el despliegue habitual usando `clasp.cmd deploy --deploymentId <id confirmado> --versionNumber <versión creada>`.
8. Confirmar versiones publicadas y probar conexión Apps Script–Cloud. Los nuevos alcances de recepción/activadores pueden requerir autorización del propietario Renato. Mantener COLA_PDF_ACTIVA desactivada: los recursos externos de cola todavía no están configurados.

El procedimiento conserva la capacidad contratada existente. Una compilación y sus imágenes consumen las cuotas habituales del proyecto; no se ha comprobado si el tramo gratuito las cubre. Las optimizaciones de recursos separados siguen siendo optativas y desactivadas en producción por defecto.
