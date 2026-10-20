# Generación del informe con la plantilla HTML

Integración publicada el 14/10/2026: Apps Script → Cloud Run → PDF, con dos versiones y el mismo registro mensual. La revisión Cloud `generar-pdf-honorarios-00025-lof` recibe el 100 % del tráfico. Apps Script usa HTML por defecto; una propiedad `CLOUD_PDF_MOTOR` explícita permite configurar una excepción. Las operaciones ya iniciadas conservan el motor fijado en su control.

`clasp push --force` subió 29 archivos. El despliegue web habitual `AKfycbzICQboJLuqLaKGKs8lh8QYZRWSAtziAprezFCkwv0Ayu3EZXTyYokP1pLbJQlKhCm6` quedó en la versión 101, conservando la URL. Existe una copia previa del código remoto en `output/backup-appscript-20261014-102427` (excluida del push). Para revertir, actualizar ese despliegue a la versión 100 y dirigir Cloud a `generar-pdf-honorarios-00023-ptr`.

El GET del enlace web responde mediante el inicio de sesión de Google; no se ingresó con un funcionario ni se escribió en el registro municipal para probar la entrega completa. La generación Cloud se comprobó directamente con datos ficticios; la prueba del flujo completo con el guardado final queda para el usuario. El endpoint canónico configurado en Main responde con `motor: HTML` y `plantilla: coquimbo-v3`.

## Ruta nueva

`PlantillaCloud.js` prepara datos desde el formulario ya validado y la identidad/función de nómina. La copia pública elimina el bloque de correo/teléfono y representa RUT, nacimiento y datos médicos con franjas negras, tras eliminar el texto sensible. Las zonas de firma del funcionario y de la jefatura se cubren aun estando vacías; los nombres impresos se mantienen. Las coincidencias sensibles dentro de actividades también se sustituyen. Cloud aplica una segunda comprobación con los datos privados conocidos y fuerza la política pública. El formato de actividades se transmite como segmentos de texto con atributos permitidos; nunca se admite HTML del usuario.

`Logica.js` conserva reserva mensual, trazabilidad, IDs persistentes de PDF, enlaces y carpetas. En modo HTML no crea ni rellena documentos temporales y no usa cuotas de conversión de Docs. Recibe los bytes desde Cloud y guarda los PDF en Drive: estas dos escrituras y las consultas de Sheets/Drive siguen usando Apps Script. No es todavía una cola asíncrona ni una eliminación total de sus cuotas.

El servicio acepta ambos contratos en `/generarPDF`. Las operaciones existentes con Docs continúan con ese motor. Las nuevas fijan el motor en su control de operación. La reutilización de resultados en Cloud es local a la instancia y dura 120 segundos; no sustituye la persistencia del control en Apps Script. Una respuesta HTTP perdida sigue requiriendo revisión de soporte: no se repite ciegamente.

## Publicación y activación, en ese orden

1. Construir/publicar el contenedor usando `cloud-run` como contexto y su `Dockerfile`. El contexto incluye únicamente el servicio, la plantilla y sus recursos; excluye la auditoría y credenciales. La clave `API_KEY` se inyecta como secreto existente. Mantener la identidad y permisos del servicio actual para las operaciones Docs pendientes. El render HTML no necesita permisos de Drive.
2. Verificar el servicio con datos ficticios, ambas versiones y documentos extensos. No activar si faltan los logos, falla Chromium o la copia pública contiene datos personales.
3. Publicar los cambios de Apps Script, incluyendo `PlantillaCloud.js`.
4. Mantener `CLOUD_RUN_URL` y `CLOUD_RUN_API_KEY` existentes: el servicio conserva su URL y clave. `CONFIG.CLOUD_PDF_MOTOR` establece HTML como valor por defecto. Si Script Properties contiene `CLOUD_PDF_MOTOR`, ese valor tiene prioridad. Para volver al motor previo, configurar `DOCS`; las operaciones ya iniciadas mantienen su motor.

## Comprobación de publicación

Antes de activar tráfico se probó la revisión mediante la etiqueta `html-prueba`: las dos versiones HTML se generaron en 5231 ms y la exportación de la plantilla Docs vacía funcionó en 2811 ms. El endpoint rechaza solicitudes sin clave con HTTP 401. El PDF público generado en Cloud tiene dos páginas, conserva la dirección de jefatura seleccionada y no contiene los datos ficticios sensibles al extraer el texto. Estos tiempos corresponden a Cloud, sin incluir validación, registro ni guardado en Drive de Apps Script. No son una prueba de carga ni una garantía de tiempo total.

Se amplió únicamente la franja de firma de jefatura a 52 pt de alto y 86 % del ancho de su celda; los nombres y la unidad de jefatura continúan siendo variables. El servicio usa la identidad `pdf-uploader-bot`, equivalente a la identidad de Drive que usaba el generador anterior mediante clave, ahora sin archivo de credenciales incorporado.

La imagen instala Chromium y sus dependencias de Linux. Un proceso reutiliza el navegador, con un contexto aislado por PDF y un límite global de 60 segundos por render. Genera las dos versiones secuencialmente para limitar el pico de memoria. Las imágenes/fuentes incorporadas se leen una vez por proceso. No se solicitan recursos externos. El servicio admite inicialmente una generación simultánea por instancia y mantiene una caché limitada. Un rechazo explícito por ocupación permite esperar y reintentar en el navegador; un timeout ambiguo no. Debe medirse el consumo en Cloud antes de subir concurrencia; las pruebas locales no certifican capacidad para 2300 funcionarios.

La espera individual muestra las dos versiones, el borrador guardado y el tiempo transcurrido, sin simular etapas ni porcentajes del servidor. Impide generar dos veces, avisa antes de cerrar la pestaña y devuelve el foco a las descargas o al formulario. Los resultados inciertos presentan una indicación de revisión por soporte. La vista previa local `?vista=generacion` permite probarlo con datos ficticios, sin conectar a servicios externos.

## Verificación local

- `npm test`: generación HTML sin Docs, privacidad con RUT dividido entre estilos, recuperación parcial, reutilización mensual y compatibilidad del contrato anterior.
- `tools/verificar-integracion-html.js`: ejecuta el adaptador real en un contexto de Apps Script simulado y el renderizador real con Chromium; genera dos PDF ficticios en `output/pdf`.
- `tools/render-plantilla.js`: referencia, ejemplo y cien actividades extensas, verificando desbordamientos.

El editor conserva títulos, negrita, cursiva, subrayado, tachado, color, resaltado, tamaños, listas, sangrías y alineación. Las familias tipográficas dependen de las fuentes disponibles en el contenedor; los logos y la fuente base van incorporados. Bloques excepcionalmente largos distintos de actividades producen error explícito en lugar de recorte. Persisten las pequeñas diferencias visuales documentadas en `plantilla-html/README.md`.


## Ajuste de paginación publicado el 14/10/2026

Revisión `generar-pdf-honorarios-00027-vel`: antecedentes y contrato sin negrita forzada, tamaños selectivos más compactos y continuidad de licencias/firmas en la última hoja de contenido. Caso aportado: ambas versiones pasan de tres a dos páginas, con texto completo y censura verificados por extracción y revisión visual de todas las páginas generadas en Cloud. Prueba del caso contra la revisión publicada: 2563 ms de ida y vuelta a Cloud para dos PDF; prueba ficticia inicial: 5610 ms; compatibilidad Docs: 2193 ms. No incluyen el flujo de Apps Script ni escrituras en Drive. 59 pruebas automatizadas correctas.

No se modificaron registros mensuales ni PDF existentes de Drive. La nueva plantilla se sirve desde Cloud; no requiere cambiar el despliegue Apps Script 105. Los informes extensos continúan en más páginas cuando lo necesitan, sin recortar contenido.
