# Configuración y operación

## Identidades y propiedades

Cloud: `direccionrrhh@municoquimbo.cl`. Apps Script y Drive: `renato.alvarez@municoquimbo.cl`. Las identidades son independientes. Proyecto Cloud `informestransparenciaactiva`, región `us-central1`, servicio `generar-pdf-honorarios`.

`Main.js` contiene IDs institucionales y límites. En una instalación de ensayo deben apuntar a recursos de prueba. `.clasp.json` es local y no se versiona; `.clasp.example.json` permite configurar otra instalación.

| Propiedad de Apps Script | Uso |
|---|---|
| `CLOUD_RUN_API_KEY` | Clave coincidente con `API_KEY` en Cloud, fuera del código. |
| `CLOUD_RUN_URL` | Endpoint `/generarPDF`; sustituye el predeterminado. |
| `CLOUD_PDF_MOTOR` | `HTML` por defecto; `DOCS` para compatibilidad. |
| `RECEPCION_ADMIN_EMAILS` | Administradores autorizados; formato en la guía de recepción. |
| `COLA_PDF_ACTIVA` | Sin configurar o `false` hasta preparar y validar la cola. |

El manifiesto usa Drive v3 y Docs v1. Los alcances nuevos pueden exigir reautorización del publicador. Comprobar permisos de carpetas e identidad visible en recepción.

## Publicar Apps Script

Usar Node.js 22 y clasp autenticado con la identidad correspondiente. Solo en una copia nueva:

```powershell
Copy-Item .clasp.example.json .clasp.json
```

Editar `scriptId` antes de continuar. No sobrescribir una configuración existente.

```powershell
clasp status
clasp deployments
```

Respaldar y comparar código remoto antes de subir. `.claspignore` excluye Cloud, documentación, herramientas y pruebas.

```powershell
clasp push
clasp version "Actualización de informes mensuales"
clasp deploy --deploymentId ID_CONFIRMADO --versionNumber VERSION_CREADA
```

Usar el ID del despliegue web habitual y la versión recién creada para conservar la URL. Los valores del ejemplo deben sustituirse. GitHub no publica Apps Script automáticamente. Probar generación y recepción con datos y carpetas de ensayo.

## Publicar Cloud

Construir desde `cloud-run/` con su `Dockerfile`. Las listas de inclusión Docker/gcloud permiten solo el servicio y sus recursos. La API requiere `API_KEY`; la compatibilidad Docs usa la identidad del servicio mediante ADC, sin archivos de claves.

Publicar primero una revisión sin tráfico, probar autenticación, ambos PDF, privacidad y Docs y después activar. La última imagen, revisión y reversión están en [PUBLICACION_PENDIENTE_2026-10-20.md](PUBLICACION_PENDIENTE_2026-10-20.md), cuya actualización inicial registra Cloud publicado.

Para comprobar explícitamente la URL habitual, la herramienta lee la metadata por entrada estándar sin imprimir claves:

```powershell
$env:PDF_TEST_CANONICAL='true'
try {
  gcloud run services describe generar-pdf-honorarios --project=informestransparenciaactiva --region=us-central1 --format=json | node tools/verificar-cloud-publicado.js
} finally {
  Remove-Item Env:PDF_TEST_CANONICAL -ErrorAction SilentlyContinue
}
```

Realiza generaciones reales con datos ficticios y consume recursos; guarda resultados en `output/`, excluido del repositorio. Para probar una etiqueta, usar `PDF_TEST_TAG` con su nombre exacto sin `PDF_TEST_CANONICAL`. Retirar etiquetas temporales al terminar y comprobar el tráfico.

`tools/verificar-pdf-publicado.py` compara copias ficticias anterior/actual con los nombres que indica su código; requiere Python, pypdf, pypdfium2 y Pillow.

## Costes y capacidad

Configuración observada: mínimo de revisión 1, máximo de revisión 20 y máximo de servicio 15; este último también limita el escalado. Cada instancia tiene 1 CPU, 1 GiB y concurrencia 1. Startup CPU boost ya estaba habilitado y se conservó. El mínimo 1 puede facturar en inactividad.

Este ajuste permite escalar a cero; **está propuesto, no ejecutado**:

```powershell
gcloud run services update generar-pdf-honorarios --project=informestransparenciaactiva --region=us-central1 --min-instances=0
```

Puede aumentar la espera inicial después de inactividad. No elimina cargos previos ni cambia la cuenta municipal. El tramo gratuito se comparte por cuenta y no garantiza un saldo fijo de generaciones.

## Cola, recepción y recuperación

Mantener desactivada la cola hasta completar [COLA_PDF_IMPLEMENTADA_2026-10-20.md](COLA_PDF_IMPLEMENTADA_2026-10-20.md). Reconciliación y guardado añaden latencia y consumen cuotas de Apps Script.

Recepción abre con `?vista=recepcion` en la web publicada; exige cuenta administrativa permitida y revisión de parejas. Consultar [RECEPCION_MASIVA_IMPLEMENTADA.md](RECEPCION_MASIVA_IMPLEMENTADA.md).

Una subida a GitHub no modifica registros mensuales, PDF de Drive ni despliegues Cloud. La revisión anterior se conserva para reversión. No limpiar reservas ni repetir envíos ambiguos sin revisar IDs de archivos y control de operación.

Documentos fechados y `docs/historial/` conservan evidencia histórica; sus límites y revisiones no sustituyen el estado actual del README y del alcance.
