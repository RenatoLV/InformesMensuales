# Informes de Honorarios · Municipalidad de Coquimbo

## Recepción masiva de dos grupos de PDF — 20 de octubre

Se preparó una pantalla administrativa en `?vista=recepcion` para seleccionar PDF locales o leer dos carpetas Drive, emparejar por nombre/RUT, revisar faltantes y duplicados, exportar el listado CSV y registrar los pares completos secuencialmente con recuperación. Las entregas usan el registro mensual existente. Requiere identidad administrativa verificable y `RECEPCION_ADMIN_EMAILS`; el acceso se deniega si no están disponibles. Activación y límites en [docs/RECEPCION_MASIVA_IMPLEMENTADA.md](docs/RECEPCION_MASIVA_IMPLEMENTADA.md). Este incremento es local, sin publicación ni cola Cloud persistente.

La aplicación local conserva la plantilla institucional, Sheets y Drive. Se corrigieron las reservas mensuales, la generación individual/masiva y la recuperación de escrituras. **Estos cambios todavía no se publicaron en Apps Script ni se desplegaron en Cloud Run.**

## Cambios incorporados

- Reserva única por RUT canónico, año y mes, antes de crear documentos.
- Máximo global inicial de 3 generaciones y 4 cargas. Se regula en `CONFIG`; es una medida conservadora para comprobar con carga real, no una garantía de capacidad.
- Gestor común de RPC: máximo 2 llamadas y 1 escritura activa por navegador, consultas idénticas compartidas, catálogo de jefaturas con caché y reintentos acotados para operaciones seguras. Los lotes generan una persona a la vez.
- Generación y carga validan la nómina sin volver a consultar historial/jefaturas. Índice de RUT compartido por 2 minutos y filas por 5 minutos; si se mueve una fila sin caché individual se reconstruye el índice antes de devolverla.
- Puntos de control con escritura de la columna W y verificación de identidad de fila; solo se vuelve a buscar el RUT si cambió su posición. Se conservan el candado y el flush para recuperación.
- Solo se resuelven las carpetas necesarias por operación. Los IDs nuevos de PDF/adjuntos no se consultan antes de crearlos; los recuperados se verifican. Los dos adjuntos duales reservan sus IDs en una sola llamada.
- Pausa compartida de 15 minutos tras error explícito de cuota diaria. Contiene tráfico; no garantiza que Google restablezca la cuota al terminar la pausa. La caché puede expirar antes y no sustituye los límites de Google.
- Navegación por secciones mediante mouse o teclado, validación al avanzar y retorno sin validar campos posteriores. Se impide salir durante una escritura y se descartan respuestas antiguas de jefatura.
- Candado de registro breve: búsqueda y escritura ocurren dentro de la misma sección crítica. Las operaciones de Docs, HTTP y guardado de archivos quedan fuera de ese candado.
- Columna W, `CONTROL OPERACION`, con ID, fases, fechas, últimas 40 transiciones y referencias de recuperación. Las 22 columnas existentes conservan su orden.
- PDF y adjuntos con IDs de Drive reservados previamente. Una repetición consulta ese ID y reutiliza el archivo.
- La misma generación sirve al modo individual y a los lotes. Acepta enlaces o los dos PDF en base64 del servicio actual.
- No se repite todo el proceso ante cualquier error. Solo los errores temporales identificados se reintentan desde el navegador con espera y variación aleatoria.
- Datos personales y campos de salud sustituidos en la copia pública. Se procesan cuerpo, encabezado y pie; se contemplan variantes habituales del RUT.
- Fechas de Chile, validación de periodos y archivos en el servidor, comprobación de firma de formato y límite de 5 MB por adjunto.
- Caché individual de dotación durante 5 minutos y caché de carpetas. Transparencia se separa también por año.
- Funciones internas y Firebase privadas para el navegador. Se deshabilitó el borrado público del historial.
- Diseño adaptable, identificación con Enter, estados accesibles y borrador de la pestaña. La sesión se comprueba nuevamente con el servidor al recargar.
- Botón Tutorial junto a Ayuda y dentro de la ayuda rápida: práctica sobre el formulario real con un RUT ficticio, antecedentes y función de nómina precargados, instrucciones para cada botón, actividades y jefatura de ejemplo, vistas de documentos y entrega simulada. Conserva la pantalla anterior, no escribe la sesión ni guarda borradores de práctica y bloquea las operaciones de servidor durante el ejemplo.

## Comprobar localmente

Con Node instalado:

```powershell
node --test tests/informes.test.js tests/solicitudes.test.js tests/formato.test.js
node tools/preview.js
```

La vista de `http://127.0.0.1:8765` usa datos ficticios. No genera documentos ni conecta con Google. `.claspignore` excluye documentación, pruebas y herramientas de la publicación.

La estimación de capacidad y el procedimiento para medirla están en [docs/CAPACIDAD_ACTUAL_2026-10-09.md](docs/CAPACIDAD_ACTUAL_2026-10-09.md). El límite configurado no acredita capacidad de producción; hay que medir tiempos y verificar cuotas de la identidad publicadora.

## Antes de actualizar el proyecto real

1. Hacer la primera prueba en un proyecto y carpetas de ensayo, con copia de la hoja y una plantilla sin datos reales. Conservar los valores de producción por separado.
2. Configurar `CLOUD_RUN_API_KEY` en **Configuración del proyecto → Propiedades del script**, con una clave válida para el servicio. La clave anterior salió del código fuente; coordinar su rotación con Cloud Run.
3. Configurar `CLOUD_RUN_URL` si cambia el servicio. Actualmente se envía un solo encabezado `x-api-key`, más `Idempotency-Key` e `operationId`. Comprobar que el servicio acepte este contrato. No se presupone que implemente idempotencia por recibir ese campo.
4. Mantener el servicio avanzado Drive v3 habilitado y los permisos de las carpetas. Los archivos no reciben nuevos permisos públicos en estas modificaciones.
5. Revisar los triggers: la consolidación administrativa se llama ahora `consolidarDotacionMensual_`; actualizar un trigger que aún use el nombre anterior.
6. Decidir y configurar autenticación verificable antes de producción. El manifiesto existente conserva `ANYONE` y ejecución como el publicador. **Un RUT identifica a una persona, pero no acredita que quien lo ingresa sea esa persona.** Esta revisión no tiene información suficiente para conectar el mecanismo institucional de acceso.
7. Probar la plantilla real y la redacción pública con ejemplos representativos. Los adjuntos escaneados que se suben directamente no se censuran automáticamente; las imágenes, texto de terceros, notas y variantes no previstas requieren un mecanismo específico o revisión.
8. Verificar carga real de 1, 3, 6 y 9 clientes, además de cortes de conexión. Registrar latencias y errores de Apps Script, Docs, Drive y Cloud Run. Solo esas mediciones permiten fijar la concurrencia final.

## Recuperación de Cloud

Si Cloud respondió y falló el guardado local, se recuperan los IDs reservados. Si falta un PDF, se exporta el documento temporal existente para completar **solo esa escritura**; esta recuperación excepcional consume cuota de conversión de Google.

Si se perdió la respuesta HTTP y no se puede saber qué hizo Cloud, el estado queda pendiente de revisión; el navegador no vuelve a enviar la generación a ciegas. Soporte puede revisar los PDF existentes y ejecutar desde el editor `confirmarArchivosCloud_(rut, mes, anio, urlRemu, urlTransp)`. La función comprueba que sean PDF distintos en las carpetas de esa operación. No se debe borrar `cloudPendiente` sin comprobar qué ocurrió en el servidor.

## Validación realizada

Las pruebas utilizan dobles locales de los servicios Google. Comprueban reservas para nueve solicitudes, equivalencia de RUT, generación repetida, colisiones durante HTTP, respuesta en URLs/base64, timeout, carga repetida, recuperación de una escritura parcial, cierre dual y censura de campos. También se revisó la navegación de la interfaz con datos ficticios, recuperación de sesión y formato de fechas.

La guía se abre desde cabecera y Ayuda. Una capa negra bloquea la pantalla y resalta cada campo del formulario real. Los 30 pasos explican el dato de ejemplo y su origen: nómina, contacto, catálogo de jefaturas, cálculo automático o ingreso del funcionario. Solo Siguiente ejecuta las acciones simuladas; Salir de la guía permite interrumpir. Se bloquean también teclado, desplazamiento y acceso a los controles de fondo.

El recorrido completo se verificó en la vista local: el contador de llamadas se mantuvo en 1 antes y después del recorrido y todos los valores anteriores del formulario se recuperaron al finalizar. Se comprobó también que se retirara el bloqueo y que la guía se adaptara a celular (375 px). La prueba de aislamiento de servicios y almacenamiento también pasó; hay 20 pruebas automatizadas aprobadas.

No se ejecutó carga contra la plataforma de producción, no se inspeccionó el código del servicio Cloud y no se validó el PDF de la plantilla real. El diagnóstico y el plan para sacar la generación pesada de Apps Script están en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

La revisión del 9 de octubre agrega el gestor común de solicitudes y la navegación por secciones. Pasan 25 pruebas automatizadas. En la vista local se comprobó acceso directo, navegación con teclado, conservación de actividades y restauración de todos los campos después del tutorial. También se corrigió la posición de la guía para mantener sus botones dentro del escritorio.

La optimización posterior del servidor pasa 30 pruebas. Las cinco comprobaciones adicionales cubren ahorro de consultas de Drive, reserva dual de IDs, puntos de control tras mover filas, validación sin historial y reconstrucción del índice de nómina, además de la pausa de cuota. Los resultados usan dobles locales, no acreditan rendimiento ni consumo facturado en producción. Se mantienen dos copias temporales de Docs por generación; trasladar solo la exportación PDF a Cloud no elimina ese consumo.

## Función contractual y editor de actividades
La función contractual es de solo lectura y se obtiene exclusivamente de la nómina, también al generar el documento en el servidor. El botón Alertar error permite solicitar revisión por función vacía o incorrecta a renato.alvarez@municoquimbo.cl, con los datos del funcionario. El envío comprueba la cuota disponible y reserva la solicitud durante 15 minutos para reducir duplicados; un envío de resultado incierto no se reintenta automáticamente.

El editor Quill se encuentra en Actividades y Avances. Ofrece fuentes, tamaños, títulos, estilos, colores, listas, sangría, alineación, deshacer y rehacer. Guarda un Delta validado junto al texto plano y aplica el formato a ambas versiones del informe. La edición no realiza llamadas a Apps Script. Escribir directamente en el campo elimina el formato anterior para evitar inconsistencias.

La suite completa pasa 36 pruebas locales, incluyendo función autoritativa, alertas con MailApp simulado, validación de formato y sustitución de párrafos. La generación contra una plantilla real y el envío real requieren validación en Apps Script tras actualizar el proyecto.

## Vista de escritorio sin chatbot
Se retiraron el widget, su historial local y el endpoint IA.js. La vista de escritorio usa un perfil lateral de 280 px y un formulario delimitado, con ancho máximo de trabajo de 1680 px. Los campos largos tienen desplazamiento interno y el editor aprovecha más ancho. Estos cambios de presentación no agregan llamadas a Apps Script.

## Diseño y acceso masivo
Tailwind se compila con npm run build:css en CSS_TAILWIND.html; no se carga el compilador en el navegador y su prefijo tw- evita colisiones con Bootstrap. Las animaciones respetan prefers-reduced-motion. El ingreso limita el RUT a 12 caracteres y filtra caracteres no permitidos. La tarjeta de ingreso masivo abre la carpeta 1sYoa2pKtHw0CNsri0k08ddmAhGnKw4aN indicada por el municipio, sin RPC ni cambio de permisos. Este acceso no registra automáticamente RUT ni importa archivos: el flujo de recepción masiva descrito en docs/RECEPCION_MASIVA_DRIVE.md es un proceso aparte.

## RUT automático
El ingreso formatea puntos y guion al escribir o pegar, conserva el cursor, admite K al final y limita el contenido a ocho dígitos de cuerpo más el verificador. Antes de consultar Apps Script se comprueba el dígito por módulo 11. Las pruebas de formato y validación amplían la suite a 38 casos aprobados.

## Editor de actividades ampliado
El editor ofrece vista de hoja, pantalla completa, ayudas de herramientas en español, contador de palabras y caracteres y un botón Nuevo apartado que inserta título y guía en el cursor. El corrector ortográfico usa la función del navegador. Se verificaron inserción, deshacer/rehacer y recuperación de títulos al aplicar y reabrir. Estas acciones no realizan RPC. La vista de hoja es una ayuda de edición, no una previsualización de la paginación de la plantilla final.
# Cola persistente PDF y costes

La nueva cola está implementada localmente y desactivada por defecto. Consultar
[activación, pruebas y objetivo de USD 5](docs/COLA_PDF_IMPLEMENTADA_2026-10-20.md).
Separa recepción, render y guardado; conserva la reserva mensual de Sheets.
Requiere configurar Cloud Tasks, Firestore, un bucket privado y el reconciliador
antes de activar `COLA_PDF_ACTIVA`. No implica un despliegue ya realizado.

