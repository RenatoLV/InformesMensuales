# Recepción masiva: primer incremento implementado

Código local preparado el 20 de octubre de 2026. Aún no publicado en Apps Script ni conectado a archivos reales durante las pruebas.

## Uso

Abrir la URL del despliegue administrativo con `?vista=recepcion`.

1. Seleccionar mes y año.
2. Agregar los PDF de remuneraciones y transparencia. Cada grupo admite selección múltiple desde el computador o lectura de una carpeta Drive. Se pueden combinar los orígenes.
3. Revisar la tabla: funcionario/RUT, PDF de remuneraciones, PDF de transparencia y estado. Los archivos deben ser individuales, de hasta 5 MB. No se abren ZIP ni se separan PDF conjuntos.
4. Los nombres se comparan con la nómina vigente ignorando mayúsculas, espacios repetidos y acentos. También se reconoce un RUT válido en el nombre. Se admiten prefijos/sufijos de versión como `REMU - NOMBRE.pdf`. No se comparan nombres por similitud aproximada. Los homónimos y nombres distintos requieren asignación explícita de RUT.
5. Quitar archivos sobrantes y asignar el RUT cuando corresponda. Un par incompleto, duplicado o ambiguo no se registra. Dos versiones de idéntico contenido se rechazan.
6. Consultar entregas del periodo para excluir periodos ya cerrados. Confirmar la revisión de identidad, entrega completa de remuneraciones y versión de transparencia.
7. Registrar pares listos. Se procesa una persona a la vez, con pausa después de la actual. Ante error se pausa el lote, se conserva lo confirmado y se indica consultar el estado antes de reintentar.
8. Descargar el listado CSV, compatible con Excel, con pendientes, errores, nombres y enlaces confirmados. Las celdas potencialmente interpretadas como fórmulas se neutralizan.

Las carpetas Drive se leen en páginas de 100 PDF, sin recorrer subcarpetas. Se pueden incluir hasta 5.000 archivos en el listado y la tabla muestra páginas de 100 filas. El emparejamiento se comprobó con 3.706 archivos de 1.853 personas ficticias. La consulta de entregas lee el historial una vez para hasta 2.000 RUT, no una vez por funcionario.

## Persistencia y recuperación

El borrador del listado queda en sessionStorage, asociado a la cuenta administrativa: nombres, IDs de Drive, asignaciones y resultados; nunca bytes/base64 de PDF. Al recargar hay que seleccionar de nuevo los archivos locales pendientes. Cerrar el navegador puede eliminar el borrador; el CSV permite conservar el listado, pero no implementa importación/reanudación automática desde CSV.

Las entregas confirmadas y su auditoría quedan en el registro mensual existente, con las dos URLs y `CONTROL OPERACION`. Se reutilizan reservas mensuales, hashes y IDs persistentes de la carga dual. La auditoría identifica lote, administrador y fecha. Un fallo tras guardar un PDF puede reanudar la escritura faltante; una repetición del mismo par ya finalizado devuelve los enlaces sin duplicar archivos. Otro contenido para ese periodo cerrado se rechaza.

El importador copia los PDF de Drive al archivo institucional usando el flujo existente: no modifica ni mueve originales. Comprueba versión antes y después de leer el PDF. Esto cuesta almacenamiento adicional, pero evita que cambios posteriores en la carpeta de recepción alteren la entrega. La futura optimización de referencias directas requiere comprobar que el origen es un archivo institucional controlado.

No genera informes ni llama al renderer Cloud. Tampoco publica o cambia permisos de archivos automáticamente. Revisar transparencia es una responsabilidad explícita de la recepción; la validación técnica de formato no certifica anonimización.

## Activación administrativa

- Configurar en Script Properties `RECEPCION_ADMIN_EMAILS` con los correos administrativos exactos, separados por coma, punto y coma o salto de línea. No existe un administrador predeterminado.
- La pantalla y cada RPC verifican `Session.getActiveUser().getEmail()`. Si Google no proporciona la identidad o el correo no está autorizado, el acceso se rechaza. Nunca se usa la cuenta efectiva del publicador como sustituto.
- El manifiesto agrega el scope `userinfo.email`. Preparar un despliegue administrativo restringido/autorizado donde la identidad del visitante sea verificable. El despliegue público actual ejecutado como publicador puede devolver correo vacío: no activar el módulo debilitando ese control. Mantener la configuración pública actual hasta verificar el acceso administrativo.
- El usuario efectivo necesita acceso a la nómina, al registro y a las carpetas de origen/destino. Conservar la configuración institucional de permisos.
- Publicar solo después de probar con cuenta autorizada, cuenta no autorizada y carpetas ficticias. El código local no demuestra que la identidad funcione en el despliegue real.

Referencia oficial de identidad: https://developers.google.com/apps-script/reference/base/session

## Validación y límites de esta etapa

Pruebas automatizadas: identificación, homónimos, RUT inválido, duplicados, límite de tamaño, CSV, escala del emparejamiento, autenticación de todos los endpoints, recuperación de escritura parcial, idempotencia, cierre mensual y archivos Drive cambiados. La suite completa se ejecuta con `node --test tests/*.test.js`.

Vista local: ejecutar `node tools/preview.js` y abrir `/recepcion` en el puerto de preview. La demostración usa `demo-remu` y `demo-transp` como carpetas ficticias y simula el registro. No accede a Google.

Esta etapa sigue usando Apps Script y Sheets para las escrituras y requiere mantener abierta la pestaña mientras se procesa el lote. No implementa todavía Cloud Tasks/Firestore, carga binaria directa a Cloud ni el procesamiento persistente en segundo plano del plan de 1.853 honorarios. Una cuenta administrativa usa un cupo de subida por vez; el límite global existente sigue siendo cuatro.
