# Revisión y optimización del renderizador Cloud

Cambios locales del 20/10/2026. Pendiente despliegue y medición en Cloud Run; gcloud requiere reautenticación. No se alteraron los límites de concurrencia de producción.

## Trabajo que ya se reutilizaba

El renderizador conservaba Chromium entre solicitudes del mismo contenedor. La plantilla también guardaba en memoria las fuentes e imágenes codificadas. La operación ya deduplicaba solicitudes repetidas y la nueva cola conserva el resultado en almacenamiento persistente. No corresponde atribuir estas capacidades a esta optimización.

## Cambios realizados

1. **Importación selectiva de Google APIs.** Se cargan Drive, Firestore, Storage y Tasks mediante sus módulos específicos de la versión bloqueada en package-lock, en lugar de cargar el catálogo completo. Las APIs de la cola se cargan solo al crearla. No se añadieron dependencias. Verificar estos puntos de entrada cuando se actualice googleapis.
2. **Menos copias de PDF en memoria.** Para limitar la caché se suman las longitudes base64 y una reserva de 64 bytes, evitando serializar ambos PDF a otro JSON solo para medirlos. La respuesta HTTP conserva su formato.
3. **Recursos fijos separados, opcionales.** Las cuatro fuentes/imágenes se leen una vez a buffers. El navegador recibe un HTML pequeño y los recursos se sirven desde memoria mediante interceptación local. El dominio .invalid nunca se consulta por red; las demás direcciones se bloquean. Cada PDF conserva un contexto aislado y sin conexión. Las exportaciones HTML autónomas siguen incluyendo sus recursos.
4. **Métricas de etapas.** El log pdf_render registra tiempo de disponibilidad del navegador, maquetación, impresión, tamaño HTML y PDF. No incluye nombres, RUT, correo ni contenido. Falta incorporar el tiempo de espera en cola y el guardado final para calcular una ETA completa.
5. **Validación de recursos.** Si una fuente o imagen institucional no carga, se rechaza el render en lugar de entregar silenciosamente un documento con tipografía de reemplazo o logos ausentes.

## Mediciones locales

Entorno: Windows, Node 24, Chrome instalado en el equipo, iniciado en modo headless con perfiles temporales. Producción usa Node 22 y Chromium de Playwright: los números locales no son un pronóstico de latencia de Cloud ni del portal completo.

Importación en tres procesos independientes por alternativa:

| Carga de módulos | Tiempo observado | Memoria residente del proceso |
|---|---:|---:|
| Catálogo googleapis completo | 4.378 / 948 / 922 ms | 129 MiB |
| Cuatro clientes específicos | 128 / 135 / 156 ms | 58 MiB |

La primera observación puede verse afectada por caché del sistema y antivirus. La memoria corresponde al proceso de prueba que importa los clientes, no al contenedor completo con Chromium.

Comparación de recursos: 18 PDF por alternativa, casos corto/medio/largo, ambas versiones y tres vueltas. Orden alternado en la segunda vuelta. El tiempo total registrado termina antes del cierre del contexto y excluye las capturas de validación.

| Medida | Recursos incrustados | Recursos separados |
|---|---:|---:|
| HTML del caso corto | 530.061 bytes | 13.128 bytes |
| Mediana de render excluyendo el primer PDF | 477 ms | 448 ms |
| Primer PDF, una observación | 1.961 ms | 2.717 ms |
| PDF corto de remuneraciones | 141.583 bytes | 141.583 bytes |

Se reduce el HTML aproximadamente 97,5%, pero la mejora de la mediana fue solo 6,1%. El primer PDF fue más lento con recursos separados en esta muestra. **Por ello producción mantiene por defecto los recursos incrustados**. La variable `PDF_RECURSOS_LOCALES=true` permite evaluar la alternativa en un despliegue de pruebas antes de adoptarla.

Los seis pares de capturas comparados en la ejecución final fueron idénticos píxel a píxel, con idéntico texto y paginación: 2 páginas en corto/medio y 4 en largo. Se verificó ausencia de RUT, nacimiento, teléfono y correo de prueba en la versión pública. El comprobador admite únicamente una tolerancia mínima de redondeo de un nivel por canal en menos del 0,01% de canales, con dimensiones, texto y páginas iguales; en la ejecución final la diferencia fue cero.

Evidencia reproducible:

- `tools/comparar-arranque-cloud.js` → `output/optimizacion-cloud/arranque.json`.
- `tools/comparar-render-cloud.js` → `output/optimizacion-cloud/resultado.json`, capturas y PDF ficticios. Configurar `PDF_CHROMIUM_PATH` cuando no esté instalado el Chromium de Playwright.
- `node --test tests/*.test.js`: 95 pruebas aprobadas después de los cambios de render, incluidas aislamiento entre personas, lista cerrada de recursos y conservación del formato autónomo.

## Qué conviene preparar con anticipación

- **Plantilla, fuentes y logos:** recursos fijos versionados dentro de la imagen del contenedor; ya disponibles sin descargas externas.
- **Navegador:** reutilizar mientras vive el contenedor, como ya hace el código. Mantener una instancia encendida para evitar el primer arranque tiene coste; no se activó ese gasto.
- **PDF confirmado de una operación:** recuperar el mismo resultado persistido si se repite la solicitud; evitar volver a renderizarlo.
- **Índice de nómina y referencias de carpetas:** son oportunidades en el tramo Apps Script/Drive; invalidar al cambiar la nómina o las carpetas y mantener verificación de identidad. Requieren medición separada del render.

Pregenerar los 2.000 PDF definitivos antes de recibir actividades, fechas y jefatura produciría documentos que luego habría que rehacer. La generación anticipada solo tiene sentido para un borrador concreto ya completo, con una versión del contenido y una invalidación explícita cuando se edita.

El siguiente paso para recortar los 30 segundos percibidos es instrumentar de extremo a extremo: nómina, reserva, carpetas, Cloud, guardado y actualización de registro. La cola actual también debe reducir la espera del reconciliador y la consulta de estado para ofrecer una entrega rápida y una estimación útil.
