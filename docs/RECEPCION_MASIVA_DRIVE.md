# Recepción masiva de informes externos mediante Google Drive

Propuesta complementaria al informe de capacidad y costos. Municipalidad de Coquimbo. Fecha: 5 de octubre de 2026. Dirigida a Informática municipal y responsables de presupuesto.

**Estado: diseño para implementación. No se ha creado ni conectado una carpeta real de Drive, instalado un disparador ni modificado el registro de producción.**

## Resultado esperado

Una unidad entrega los informes de 200 funcionarios mediante una carga de archivos en Drive y la nómina que ya utiliza para combinar correspondencia. El sistema registra una entrega por RUT, año y mes; vincula original y versión para transparencia; impide generar otro informe de ese periodo en el portal y entrega un resumen de errores. Los funcionarios no deben registrar individualmente esos 200 informes.

La recepción debe usar el mismo registro y la misma reserva mensual que el portal. Una planilla de importación separada, que el portal no consulte, dejaría abierta la generación de duplicados.

## Carpetas y entrega

Se recomienda una unidad compartida institucional, si la edición de Workspace contratada la permite. Los archivos de una unidad compartida pertenecen a la organización. Una carpeta compartida en «Mi unidad» no equivale a una unidad compartida. [Documentación de Google](https://developers.google.com/workspace/drive/api/guides/about-shareddrives).

```text
RECEPCION_MASIVA_PRIVADA/
  2026/
    09_SEPTIEMBRE/
      UNIDAD_A/
        LOTE_001/
          ORIGINALES/
            INF-0001.pdf
            INF-0002.pdf
          TACHADOS_PARA_REVISION/
            INF-0001.pdf
            INF-0002.pdf
          nomina.csv

ARCHIVO_MENSUAL_PRIVADO/
  2026/09_SEPTIEMBRE/UNIDAD_A/

TRANSPARENCIA_APROBADA/
  2026/09_SEPTIEMBRE/UNIDAD_A/
```

Las tres raíces son distintas. Recepción, nómina y originales tienen acceso restringido. La carpeta de transparencia recibe únicamente las versiones revisadas para su publicación conforme al procedimiento municipal. El encargado deposita el lote completo y lo marca como listo; subir el primer archivo no significa que todo el lote esté completo.

Para reducir operaciones, se pueden registrar referencias a PDF que ya estén en las carpetas institucionales definitivas. Esto requiere permisos que impidan a los remitentes cambiar o borrar los archivos una vez aceptados. Si la recepción permite cambios posteriores, la aceptación debe crear una copia controlada y registrar sus nuevos IDs antes de cerrar la entrega. El procesador no debe alterar las carpetas compartidas de los usuarios sin esta configuración explícita.

## Identificación mediante nómina privada

Se reutiliza la lista de combinación de correspondencia, agregando un código de informe y los nombres de archivo. La plantilla adjunta utiliza CSV UTF-8 separado por punto y coma:

| Columna | Contenido |
|---|---|
| RUT | RUT con dígito verificador; validar y normalizar antes del registro. |
| CODIGO | Identificador sin datos personales, único dentro del lote. |
| ANIO | Año explícito, por ejemplo 2026. |
| MES | Mes del informe, por ejemplo SEPTIEMBRE; no el mes de la subida. |
| ARCHIVO_ORIGINAL | Nombre exacto del PDF dentro de ORIGINALES. |
| ARCHIVO_TRANSPARENCIA | Nombre exacto del PDF dentro de TACHADOS_PARA_REVISION. |

Un ejemplo de vinculación es `RUT del funcionario → INF-0001 → ambos PDF`. El RUT queda en el registro interno y en la nómina privada. Los nombres de archivo destinados a publicación no contienen RUT. El nombre y la unidad del funcionario se contrastan con la dotación autorizada para ese periodo.

No se debe intentar identificar al funcionario leyendo el RUT del PDF tachado: precisamente puede estar eliminado. Tampoco basta el nombre, porque pueden existir homónimos. Si hoy los archivos se nombran con RUT, se puede contemplar un adaptador de entrada privado; el archivo preparado para publicar se renombra con un código y se revisan sus metadatos.

## Flujo de procesamiento

1. El responsable carga los originales, las versiones tachadas y la nómina; declara el lote listo mediante una acción administrativa autenticada o una marca controlada.
2. El procesador realiza una validación previa: estructura del CSV, periodo, RUT y dígito verificador, pertenencia a dotación, códigos y RUT repetidos, existencia de PDF y correspondencia de nombres. Los originales y tachados deben tener IDs distintos. Los nombres duplicados dentro de una carpeta generan error, no una selección arbitraria.
3. Se consulta el historial común. Una entrega existente de la aplicación o de otro lote se informa como conflicto. Repetir exactamente el mismo lote y archivos devuelve el registro existente; no agrega otra entrega ni sobrescribe archivos.
4. Cada entrada admitida reserva la clave `RUT + AÑO + MES` de forma atómica y queda como **RECIBIDO EXTERNO / EN REVISIÓN**. El control del portal debe reconocer esa reserva y bloquear una nueva generación. Una reserva pendiente no significa que el informe esté aprobado.
5. Se guardan ID de lote, remitente autorizado, fecha de recepción, origen DRIVE MASIVO, IDs de archivos, versión o huella disponible y eventos. Si falta un archivo, se registra la observación y se permite completar esa misma entrega según la política municipal.
6. La revisión distingue aceptación administrativa del informe y aprobación de su versión para transparencia. El PDF privado queda en el archivo mensual y el público aprobado en su carpeta de transparencia. Una rectificación conserva las versiones anteriores y registra quién la autorizó.
7. Se entrega un resumen por lote: recibidos, pendientes, conflictos y errores, con detalle privado por RUT. El resumen de ejemplo «200 filas: 190 admitidas, 6 incompletas, 4 conflictos» debe poder conciliarse con las 200 filas de entrada.

Una nómina sin archivos puede registrar que la unidad anunció una entrega, pero no debe cerrar 200 informes como entregados. La política debe definir si ese anuncio reserva el periodo y durante cuánto tiempo; no se equipara automáticamente a una recepción verificada.

## Alternativa económica y límites

Para PDF ya separados por funcionario, la primera alternativa es **Drive + Apps Script + el registro existente**, sin volver a generar documentos ni llamar al servicio de conversión. El costo adicional puede limitarse a desarrollo, operación y almacenamiento si la municipalidad ya dispone de la licencia y capacidad necesarias. Debe comprobarse lo contratado; no se presupone almacenamiento ilimitado ni costo cero.

Apps Script puede consultar la recepción con un disparador de tiempo, por ejemplo cada cinco minutos mientras existan lotes pendientes. No dispone de un disparador instalable nativo «archivo subido a una carpeta de Drive» dentro de los eventos documentados. El intervalo de revisión no garantiza un plazo exacto de finalización. [Disparadores de Apps Script](https://developers.google.com/apps-script/guides/triggers/installable).

El procesamiento se divide en bloques pequeños, inicialmente 20 entradas como parámetro de piloto, con un presupuesto de tiempo y un punto de recuperación persistente. Solo un consumidor toma cada lote. No se recorren todas las carpetas históricas en cada ejecución ni se realizan consultas a Drive dentro del candado del historial. La API permite buscar por carpeta, limitar los campos retornados y paginar los resultados. [Búsqueda de archivos](https://developers.google.com/workspace/drive/api/guides/search-files).

El tamaño de bloque y la frecuencia deben ajustarse con un ensayo real de 200 entradas y otro de 2.300. Apps Script mantiene su límite de seis minutos por ejecución y las cuotas diarias, incluso para disparadores. Esta propuesta reduce el trabajo por informe, pero no elimina las cuotas. [Cuotas oficiales](https://developers.google.com/apps-script/guides/services/quotas).

Si las entregas requieren separación de PDF grandes, OCR o recepción continua de muchas unidades, se utiliza la cola persistente y el worker Cloud Run propuestos en el informe principal. El registro mensual sigue siendo el mismo para ambos canales. No se incorporan IA ni OCR cuando la nómina ya aporta la relación RUT–archivo.

## Si la combinación entrega un solo PDF

Un PDF conjunto requiere una nómina con los rangos de páginas de cada funcionario para el original y para la versión tachada. Deben validarse páginas fuera de rango, solapamientos, omisiones y la correspondencia entre ambas versiones. No se presupone que cada persona ocupa dos páginas ni que ambas versiones conservan el mismo número de páginas.

La alternativa más sencilla para operación es exportar un PDF por funcionario desde la combinación. Si se mantiene el PDF conjunto, el worker puede separarlo según rangos explícitos y generar los archivos individuales sin rehacer su contenido. Compartir el PDF original de los 200 como enlace personal de cada funcionario expondría los informes de los demás; debe evitarse.

## Revisión de las versiones tachadas

La carga se considera una versión aportada para revisión, no una certificación de anonimización. Hay que comprobar que los datos reservados no permanecen bajo rectángulos negros, en texto copiable, comentarios, capas o metadatos. Los informes escaneados necesitan una revisión acorde con su contenido. El registro distingue recibido, revisado y publicado, con responsable y fecha.

## Integración pendiente en este proyecto

El módulo actual `Masivo.js` procesa la generación por persona mediante `procesarInforme`; no importa entregas externas de carpetas. El historial de `Concurrencia.js` ya reúne RUT, periodo, enlaces y control de operación. Para implementar este canal se requiere:

- Incorporar un importador administrativo privado, configuración de carpetas y registro durable de lotes; no exponer una función de importación abierta al navegador.
- Ampliar la reserva y la consulta de estado para reconocer entregas externas pendientes, sin sustituir ni cerrar operaciones activas del portal.
- Incorporar validación previa, reanudación y resumen de errores por lote.
- Separar permisos y estados de recepción, aceptación del original y publicación para transparencia.
- Confirmar el formato real de la combinación y la dotación aplicable a cada periodo.

## Criterios de aceptación del piloto

- Cargar 200 filas y sus archivos sin registro individual en el portal, con conciliación completa de resultados.
- Importar el mismo lote dos veces y comprobar cero registros mensuales duplicados y cero copias adicionales por reintento.
- Competir con una generación del portal para el mismo RUT y periodo: solo una entrega toma la reserva y la otra recibe el conflicto correspondiente.
- Interrumpir una ejecución y reanudar sin perder avances ni declarar entregados los archivos faltantes.
- Detectar RUT inválido, persona fuera de dotación, PDF faltante, nombres repetidos y original/tachado con el mismo ID.
- Comprobar permisos reales: el público no accede a originales ni nóminas y un remitente no puede alterar una entrega aceptada.
- Registrar la decisión de revisión antes de publicar y verificar el contenido y metadatos del PDF público.
