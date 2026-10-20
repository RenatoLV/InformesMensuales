# Plantilla HTML del informe municipal

Referencia: `INFORME PLANTILLA (1).docx` y `INFORME PLANTILLA.pdf` suministrados por el usuario. El PDF determina la distribución visual. Los dos gráficos de `assets/` se extrajeron del DOCX sin reconstruirlos.

La plantilla conserva las dos páginas base, sus secciones, tablas, marcos, firmas y tamaño personalizado de 609 × 893 puntos. No se debe convertir a A4. Las actividades extensas continúan en páginas adicionales, manteniendo el orden de las secciones. El pie gráfico conserva su posición original, incluso la superposición con el marco de observaciones presente en la referencia.

## Uso

`referencia.html` es autónomo: incorpora imágenes y fuentes, sin solicitudes externas. Puede abrirse para revisar e imprimir, con escala 100 %, sin encabezados ni pies del navegador y con gráficos de fondo activados.

Para completar datos en Node.js:

```js
const {crearHTML, campos} = require('./plantilla');
const html = crearHTML(datos);
```

`campos` enumera las claves del objeto. `fecha` corresponde al nacimiento; `periodoMes` y `periodoFinMes`, al inicio y fin del periodo. `tieneLicencia` es un booleano opcional para marcar Sí/No. Los valores se escapan antes de insertarse en HTML.

Para producir PDF con Chromium/Playwright, cargar el HTML, esperar `window.templateReady`, comprobar `window.templateError` y usar `page.pdf({printBackground:true, preferCSSPageSize:true})`. `tools/render-plantilla.js`, en la raíz del proyecto, muestra el procedimiento y verifica desbordamientos. Requiere Playwright y un Chromium instalado; admite `CODEX_PLAYWRIGHT_PATH` y `PDF_CHROMIUM_PATH`.

## Validación y límites

- Referencia y ejemplo breve: dos páginas.
- Ejemplo de 100 actividades y función extensa: seis páginas; las 100 actividades permanecen en orden y sin pérdida de texto.
- Sin desbordamientos detectados en esos tres casos; comparación visual con las dos páginas originales.
- Fuentes Liberation Sans incorporadas, compatibles en métricas con Arial. Se incluye su licencia. Hay pequeñas diferencias de tipografía y posición: no se certifica identidad píxel a píxel.
- Las actividades reciben texto con saltos de línea o `lineasActividades`, preparado desde Quill por `PlantillaCloud.js`; se conservan estilos permitidos y se dividen entre páginas sin perder segmentos de texto.
- Los bloques distintos de actividades que excedan una página producen un error explícito; aún requieren tratamiento específico para entradas excepcionalmente extensas.
- Esta plantilla no redacta datos sensibles por sí misma. El futuro adaptador debe preparar por separado los datos de remuneraciones y transparencia.

La integración Apps Script/Cloud se publicó el 14/10/2026; los resultados y la activación se describen en `../INTEGRACION-HTML.md`. La nueva ruta HTML evita Google Docs, pero conserva las escrituras PDF en Drive y el registro mediante Apps Script.


## Ajuste de lectura y paginación, 14/10/2026

Los antecedentes se imprimen en letra normal de 11 pt; la función contractual usa 10,5 pt con interlineado de 12 pt. Las fechas usan 11 pt y un recuadro de 36 pt, frente a los 62 pt anteriores. Dificultades, jefatura y contacto dejan de recibir negrita forzada. Las actividades conservan el formato elegido en el editor.

Cuando el contenido continúa en otra hoja, licencias y firmas siguen en esa misma hoja mientras quepan, en lugar de reservar una página independiente. El caso de tres páginas aportado por el usuario se comprobó en dos, en ambas versiones, conservando contrato y actividades completos, logos, espacios de firma y censura pública. Esto no impone un máximo de dos páginas a informes extensos.

La generación observada en Cloud a las 14:58:17 UTC tardó 1536 ms para ambas versiones, coincidiendo con la fecha de creación de los PDF revisados. El tiempo total informado por el usuario fue de unos 20 s: no se dispone de mediciones individuales de las otras etapas para atribuir el resto a una llamada concreta. Apps Script sigue consultando nómina, reservando el periodo, creando/resolviendo carpetas, guardando dos PDF y registrando puntos de recuperación.
