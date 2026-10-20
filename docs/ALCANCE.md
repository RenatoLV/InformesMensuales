# Alcance de Informes Mensuales

Estado de referencia: 20 de octubre de 2026. Se distingue código implementado de código publicado.

## Objetivo

Gestionar identificación en nómina, redacción de actividades, generación de remuneraciones y transparencia, recepción de archivos finales y seguimiento mensual para unos 1.853 honorarios. El volumen de planificación es de 1.500–2.000 parejas de PDF mensuales; parte de las entregas se recibe manualmente.

## Incluido

| Área | Implementación |
|---|---|
| Formulario | RUT y periodos, datos contractuales autoritativos, jefaturas, editor con formato y tutorial ficticio. |
| PDF | Plantilla HTML institucional, recursos incorporados y protección de campos sensibles en transparencia. |
| Registro | Sheets, Drive, reserva única mensual, IDs previstos y recuperación parcial. |
| Recepción | Archivos locales o carpetas Drive, emparejamiento, revisión de dudas, procesamiento secuencial y CSV. |
| Tráfico | Caché de nómina, límites de RPC, reservas y reintentos de operaciones seguras. |
| Cola opcional | Persistencia, deduplicación, intentos acotados, resultados y reconciliación; requiere infraestructura y activación. |

## Estado publicado

- Cloud: `generar-pdf-honorarios-00029-huw` activa al 100 %. HTML y compatibilidad Docs comprobados; formato ficticio equivalente al anterior.
- Apps Script: cambios locales incluidos; no se ejecutó su publicación el 20 de octubre. Consultar versión remota antes de actualizar.
- Cola: desactivada, sin infraestructura desplegada. No es una cola operativa de producción.
- GitHub: contiene fuentes; no actualiza automáticamente Apps Script ni Cloud.

## Límites

- Apps Script síncrono permite 3 generaciones y 4 cargas globales. No equivale a limitar a tres personas navegando.
- Cloud admite una solicitud por instancia. Máximo de revisión 20 y de servicio 15: el valor 20 no garantiza 20 instancias efectivas.
- Las cuotas de Apps Script, Drive y Sheets siguen presentes aun usando cola.
- Las 95 pruebas locales usan principalmente servicios simulados; no certifican una ráfaga real de 100 usuarios.
- Coincidencias dudosas requieren revisión humana. Los PDF recibidos no se censuran automáticamente.
- Un RUT no sustituye autenticación. Recepción exige identidad Google verificable y lista administrativa.
- Caché por instancia no es persistencia frente a reinicios. La reserva mensual y la cola opcional cumplen funciones diferentes.

## Pendientes priorizados

1. Publicar Apps Script y comprobar permisos, recepción y lista administrativa con recursos de ensayo.
2. Decidir mínimo 0 de Cloud y medir arranques. No se aplicó ni se cerró facturación.
3. Medir carga progresiva de extremo a extremo, incluyendo espera, guardado, errores y duplicados.
4. Elegir cola Cloud o servidor municipal. La alternativa municipal requiere integración, autenticación, persistencia y recuperación; no basta con ejecutar el contenedor.
5. Si se elige cola Cloud, preparar Tasks, Firestore, bucket privado, IAM y reconciliador, validar fallos y medir costes antes de activar.
6. Definir acceso institucional y soporte con Informática.

## Fuera del alcance realizado

No se implementaron servidor municipal, sustitución de Sheets como registro principal, firma electrónica, OCR, censura de PDF escaneados, SLA certificado ni garantía de coste cero o USD 5. Firebase es un adaptador conservado para una posible migración, no la base operacional activa.

## Criterios de aceptación

- No crear parejas duplicadas por operación ni cruzar funcionarios.
- Guardar ambos PDF antes de anunciar generación completada.
- Mantener formato y proteger los campos sensibles definidos en transparencia.
- Conservar trazabilidad de envíos ambiguos sin repetición ciega.
- Registrar solo parejas revisadas en recepción y permitir recuperación de errores.
- Separar métricas de Cloud del tiempo completo del portal y contrastar costes con facturación real.
