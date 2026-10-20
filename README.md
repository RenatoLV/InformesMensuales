# Informes Mensuales de Honorarios

Portal de la Municipalidad de Coquimbo para generar informes de remuneraciones y transparencia, recibir sus versiones finales y registrar la entrega mensual en Google Sheets y Drive. El motor HTML conserva el formato institucional de ambos PDF.

## Estado · 20 de octubre de 2026

| Componente | Estado comprobado |
|---|---|
| Cloud Run | Publicado: `generar-pdf-honorarios-00029-huw`, 100 % del tráfico. |
| Formato PDF | Dos documentos ficticios comparados con la revisión anterior: mismo texto, páginas y píxeles. |
| Apps Script y recepción masiva | Código incluido; los cambios del 20 de octubre no se publicaron desde esta sesión. |
| Cola persistente | Implementada con pruebas locales; desactivada por defecto y sin infraestructura provisionada. |
| Servidor municipal | Alternativa propuesta; no implementada ni conectada. |
| Validación | 95 pruebas locales aprobadas; no certifican 100 usuarios reales simultáneos. |

Consultar el [alcance](docs/ALCANCE.md) y la [guía de operación](docs/OPERACION.md). Los documentos históricos conservan el estado observado en su fecha.

## Funcionalidades

- Identificación por RUT y datos contractuales obtenidos de la nómina.
- Editor de actividades, borrador de sesión y tutorial ficticio.
- Dos PDF: remuneraciones y transparencia, con protección de los campos sensibles definidos en la copia pública generada.
- Registro único por RUT, año y mes, reservas, IDs persistentes de Drive y recuperación de guardados parciales.
- Carga de PDF finales y recepción administrativa desde el computador o dos carpetas Drive, revisión de coincidencias, faltantes y duplicados y exportación CSV.
- Caché de nómina, control de solicitudes y reintentos acotados.
- Cola opcional con seguimiento, sujeta a preparar servicios externos y validar su activación.

## Organización

```text
*.js / *.html / appsscript.json  Apps Script e interfaz
cloud-run/optimizado/           API Node.js, renderizador y cola opcional
cloud-run/plantilla-html/       Plantilla, fuentes y recursos institucionales
cloud-run/Dockerfile            Imagen del generador
docs/                          Alcance, operación, planes e historial
tests/                         Pruebas y servicios simulados
tools/                         Vista previa, CSS y verificaciones
```

Apps Script permanece en la raíz para conservar las rutas de clasp y las herramientas. Las antiguas carpetas `src/` y `api-server/` se sustituyen por esta estructura.

## Desarrollo local

Usar Node.js 22, igual que la imagen Cloud:

```powershell
npm ci
npm test
npm run preview
```

Abrir `http://127.0.0.1:8765` o `http://127.0.0.1:8765/recepcion`. Las vistas usan datos ficticios: no generan informes reales ni escriben en Google. Compilar estilos con `npm run build:css`.

Para trabajar con el generador:

```powershell
cd cloud-run/optimizado
npm ci
npx playwright install chromium
```

El contenedor instala también las dependencias de Linux. La API necesita `API_KEY` en el entorno. La compatibilidad Docs utiliza credenciales de aplicación predeterminadas, sin archivos de claves privadas incluidos.

## Publicación

GitHub, Apps Script y Cloud Run son publicaciones independientes. Este repositorio no despliega automáticamente servicios.

1. En una instalación nueva, copiar `.clasp.example.json` a `.clasp.json` y configurar el ID de destino. No reemplazar la configuración local de producción existente.
2. Configurar propiedades, permisos y recursos de ensayo según [OPERACION.md](docs/OPERACION.md).
3. `clasp push` sube el código; para actualizar la URL web hay que crear una versión y editar el mismo despliegue.
4. Para Cloud, construir con `cloud-run/` como contexto, probar una revisión sin tráfico y activarla después. Conservar las claves fuera del repositorio.
5. Mantener `COLA_PDF_ACTIVA` sin configurar o en `false` hasta preparar su infraestructura.

Los IDs institucionales de Sheets, plantilla, carpetas y servicio están en `Main.js`; identifican recursos, no conceden acceso. Una copia de ensayo debe apuntar a recursos de prueba antes de ejecutar operaciones reales.

## Capacidad y costes

Volumen objetivo: 1.853 personas y 1.500–2.000 generaciones mensuales, con dos PDF cada una. La ruta sin cola limita Apps Script a 3 generaciones y 4 cargas globales. La capacidad depende también de cuotas de Google y del escalado; no está certificada para 100 generaciones simultáneas.

Cloud mantiene mínimo de revisión 1, máximo de revisión 20 y máximo de servicio 15, con 1 CPU y 1 GiB por instancia. El mínimo 1 puede facturar en inactividad. Se propuso mínimo 0, pero no se aplicó. No se garantiza coste cero ni un máximo mensual de USD 5.

## Documentación

- [Alcance, límites y pendientes](docs/ALCANCE.md).
- [Configuración, publicación y operación](docs/OPERACION.md).
- [Recepción masiva](docs/RECEPCION_MASIVA_IMPLEMENTADA.md).
- [Cola persistente: requisitos y límites](docs/COLA_PDF_IMPLEMENTADA_2026-10-20.md).
- [Plan de operación para 1.853 honorarios](docs/PLAN_OPERACION_1853_HONORARIOS_2026-10-20.md).
- [Mediciones del renderizador](docs/OPTIMIZACION_RENDER_CLOUD_2026-10-20.md).
- [Publicación Cloud y reversión](docs/PUBLICACION_PENDIENTE_2026-10-20.md).
- [Historial de la documentación anterior](docs/historial/README_PREVIO_2026-10-20.md).

No se versionan credenciales, configuración local de clasp, respaldos, resultados, documentos operativos ni copias antiguas de auditoría. Los PDF recibidos de terceros no se censuran automáticamente. El RUT identifica un registro, pero no autentica por sí solo al funcionario.
