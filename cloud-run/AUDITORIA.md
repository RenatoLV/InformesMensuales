# Auditoría del generador Cloud Run — 9 octubre 2026
Proyecto: informestransparenciaactiva. Servicio: generar-pdf-honorarios. Revisión observada: generar-pdf-honorarios-00023-ptr.

Configuración observada: 1 CPU, 1 GiB, concurrencia 80, timeout 300 s. Mínimo de revisión 1; máximo de revisión 20 y máximo de servicio 15. Estas cifras son límites configurados, no capacidad demostrada.

El servicio exporta dos Docs mediante Drive API y devuelve PDF Base64; Apps Script crea los documentos y guarda los archivos. Cloud no elimina las cuotas de Drive/Docs. El código desplegado incluye una clave de cuenta de servicio y valida API_KEY mediante coincidencias parciales y claves alternativas. Se recomienda retirar ese archivo del despliegue nuevo y revisar la rotación de la clave con Informática.

## Versión local preparada
cloud-run/optimizado: autenticación exacta con API_KEY obligatoria; ADC sin claves incluidas; Drive readonly; cuerpo de petición de 32 KB; tres generaciones simultáneas por instancia; exportaciones con timeout 60 s; petición duplicada simultánea comparte resultados; caché de resultados de 120 s y máximo 32 MiB. Los errores no imprimen claves ni nombres de funcionarios. Suite completa: 41 pruebas aprobadas.

La reutilización es local a una instancia y temporal: no es idempotencia persistente entre reinicios o instancias. Apps Script conserva sus reservas y su bloqueo de reenvíos inciertos. No se aumentaron cuotas ni se modificó el servicio desplegado.

## Validación previa a tráfico de producción
Desplegar revisión sin tráfico usando pdf-uploader-bot@informestransparenciaactiva.iam.gserviceaccount.com, conservar API_KEY mediante configuración existente sin copiarla al código y verificar exportación de un informe ficticio con formato y transparencia. Comprobar acceso de esa identidad a copias nuevas de Docs. Mantener revisión anterior para reversión. Medir latencia, memoria y fallos con 3/6/9 solicitudes antes de elegir concurrencia y escalado. El mínimo cero permite evitar una instancia permanente, con coste de arranque en frío; aplicar tras medirlo.
