# Capacidad de la plataforma de informes

Evaluación del código local al 9 de octubre de 2026. Dirigida a Informática Municipal y responsables de operación. Las mejoras descritas están en el proyecto local; no se ha actualizado el despliegue ni realizado carga contra producción.

## Qué admite ahora el código

La configuración mantiene **3 generaciones y 4 subidas simultáneas para toda la aplicación**. Una generación produce las dos versiones del mismo informe. Estas cifras son límites preventivos configurados, no resultados de un ensayo de rendimiento.

Cuando 9 funcionarios solicitan generar a la vez, como máximo 3 obtienen reserva; los demás reciben una respuesta de ocupación y sus navegadores reintentan con espera aleatoria. No se procesan 9 generaciones al mismo tiempo. No hay una cola persistente con posición garantizada: hay reservas en el servidor y espera en cada navegador.

Tener la página abierta o escribir actividades no consume una ejecución del servidor constantemente. Por eso no se puede traducir “funcionarios conectados” en “generaciones simultáneas”. No hay evidencia para afirmar que admite 100, 500 o 2.300 usuarios activos al mismo tiempo. El volumen mensual de 1.831–2.300 informes puede distribuirse en varios días, sujeto a tiempos y cuotas.

## Cambios realizados

- Todas las llamadas del navegador pasan por un gestor común: máximo 2 RPC activos por página y 1 operación de escritura activa por página. Cada lote genera una persona a la vez para dejar capacidad disponible a los demás.
- Las lecturas idénticas pendientes comparten una llamada. La jefatura se consulta después de identificar al funcionario, y su catálogo se conserva en memoria del navegador por 5 minutos y en caché del servidor por hasta 5 minutos. El estado de generación/entrega no se cachea en el navegador.
- Una generación o subida idéntica pendiente comparte la petición; una versión diferente se rechaza hasta que termine la anterior. Los reintentos automáticos solo se permiten para lecturas y operaciones con protección de idempotencia, ante respuestas de ocupación o saturación transitoria. Un timeout ambiguo, un fallo de Cloud o una cuota diaria agotada no dispara una repetición automática.
- Hasta 7 reintentos, con esperas crecientes y aleatorias de 5–35 segundos. Suman aproximadamente 155–190 segundos de espera, además de los tiempos de ejecución. La espera ocurre en el navegador y libera los cupos locales. Si la demanda persiste, se muestra el fallo y se conserva el progreso recuperable.
- La admisión preliminar consulta las reservas antes de leer Sheets o decodificar adjuntos, cuando ya están ocupados todos los cupos. La reserva definitiva se sigue haciendo bajo candado. El intento de admisión espera como máximo 500 ms por ese candado; los puntos de control conservan su espera de 5 segundos para proteger la recuperación.
- Las secciones del formulario se pueden seleccionar con mouse o teclado. Se comprueban los campos al avanzar, se permite retroceder sin obligar a completar campos posteriores y se conserva el borrador. Se impide abandonar la pantalla mientras una escritura está pendiente. Las respuestas antiguas de una selección de jefatura ya no reemplazan la selección nueva.

Estos cambios reducen llamadas evitables y picos de reintentos. El límite por navegador no impide que muchos navegadores envíen solicitudes simultáneamente; la capacidad global sigue dependiendo de Apps Script, Sheets, Drive, Docs y el servicio Cloud.

## Estimación de procesamiento

Sea T el tiempo medio completo de una generación, desde que obtiene reserva hasta que la libera, incluyendo Docs, Drive, Cloud y registro. Con 3 reservas, el techo aritmético es `3 × 3.600 / T` informes por hora. Los siguientes son escenarios supuestos, **no mediciones de esta plataforma**.

| Duración media T | Techo teórico por hora | 1.831 informes | 2.300 informes |
|---|---:|---:|---:|
| 30 segundos | 360 | 5,1 horas | 6,4 horas |
| 60 segundos | 180 | 10,2 horas | 12,8 horas |
| 90 segundos | 120 | 15,3 horas | 19,2 horas |
| 120 segundos | 90 | 20,3 horas | 25,6 horas |

Los tiempos suponen ocupación continua de los 3 cupos, sin fallos, pausas, cuotas diarias ni competencia por Sheets. La tasa sostenible real será menor. Para presupuestar una ventana operativa conviene reservar holgura y usar tiempos medidos en horas de mayor demanda, no el mejor resultado individual.

Para 9 solicitudes simultáneas, el modelo ideal tiene 3 tandas. Con T=60 segundos, las últimas terminarían alrededor de 3 minutos después de la primera solicitud, más la espera de reintento y la contención. No es un compromiso de respuesta ni se garantiza el orden de llegada. Un pico de 200 solicitudes excedería ampliamente esa ventana y requiere una cola de trabajos persistente o repartir la entrega por horarios.

Las subidas tienen otro límite: `4 × 3.600 / S`, donde S es su duración media. Por ejemplo, S=10 segundos daría 1.440 subidas/hora como techo teórico; no se ha medido S. Generación y subida comparten servicios y cuenta, por lo que ambos techos no se deben sumar como rendimiento garantizado.

## Límites de Google que siguen aplicando

Google publica 6 minutos por ejecución, 30 ejecuciones simultáneas por usuario y 1.000 por script. La cuenta personal tiene cuotas de 250 documentos creados y 2.000 conversiones por día; Workspace publica 1.500 y 4.000 respectivamente. Las cuotas pueden cambiar y existen límites adicionales de los servicios asociados. [Fuente oficial de cuotas](https://developers.google.com/apps-script/guides/services/quotas).

El manifiesto del proyecto ejecuta como `USER_DEPLOYING`. Debe planificarse el consumo sobre la identidad del publicador; el límite de 1.000 por script no implica 1.000 funcionarios ejecutando operaciones con esa cuenta. Las búsquedas, el chatbot, los reintentos de admisión y otros scripts de esa identidad también pueden competir por ejecuciones.

El código todavía crea dos copias temporales de Google Docs por informe; enviar la exportación PDF a Cloud no elimina ese trabajo. **Si ambas copias consumen la cuota de documentos creados**, el presupuesto conservador sería 125 informes/día en cuenta personal o 750 en Workspace, antes de otros consumos. Bajo ese supuesto, 1.831 informes requieren al menos 3 ventanas diarias en Workspace y 2.300 requieren 4; no debe prometerse completar todo en un solo día. La imputación exacta de las copias a la cuota debe comprobarse con la identidad y los métodos reales. Eliminar los temporales no se debe considerar devolución de cuota.

La exportación normal se hace mediante Cloud; la conversión local solo aparece en recuperación. No se ha inspeccionado el servicio Cloud ni sus instancias, tiempos o cuotas efectivas de Drive, de modo que no se puede afirmar que soporte una carga determinada.

El límite de 10 llamadas simultáneas de `google.script.run` es por cliente; no es una garantía global de capacidad. El gestor local usa un límite menor. [Documentación oficial de comunicación](https://developers.google.com/apps-script/guides/html/communication).

## Cómo obtener una cifra defendible

1. En una copia de ensayo con la misma identidad, plantilla y configuración de Cloud, medir 30 generaciones individuales con textos y tamaños representativos. Registrar duración completa, tiempo de reserva, fallos y latencias; evitar datos personales en el informe de medición.
2. Repetir con 3, 6 y 9 navegadores concurrentes, incluyendo búsquedas y subidas. Medir tasa de informes terminados, percentil 95 de espera total, rechazos, errores de cuota y reservas sin liberar.
3. Mantener una prueba durante 30 minutos y revisar ejecuciones de Apps Script y registros de Cloud. Usar `CONTROL OPERACION` para contrastar las fases y la recuperación. La consola del navegador registra solo nombre de operación, duración del RPC y resultado.
4. Probar corte de conexión y reingreso: el mismo RUT y mes debe recuperar la entrega sin duplicar documentos. Una respuesta Cloud no confirmada debe ir a revisión, sin exportar de nuevo a ciegas.
5. Fijar una ventana de entrega y un nivel de servicio con esos resultados. Mantener 3/4 hasta que las mediciones justifiquen otro valor; aumentar constantes sin medir puede empeorar la contención.

Si el objetivo es recibir cientos de solicitudes al mismo tiempo y procesarlas aunque los funcionarios cierren el navegador, el siguiente cambio necesario es una cola persistente y workers externos. Para superar el presupuesto de creación de documentos, también hay que sacar de Apps Script la composición completa de los dos documentos, no solo su exportación. Drive puede seguir siendo el destino final y Sheets el registro administrativo durante la transición.

## Validación disponible

La optimización posterior reduce consultas internas sin modificar los cupos globales 3/4. En el camino normal de PDF en base64 evita dos consultas de existencia en Drive; ambas se mantienen para IDs recuperados. La entrega dual reserva ambos adjuntos con una sola petición. Los puntos de control escriben una celda en vez de 23 y reutilizan una fila verificada. La validación de nómina omite historial y jefaturas al generar/subir; un índice compartido de 120 segundos evita escanear la columna RUT por cada funcionario cuando la caché está disponible. Las nuevas filas pueden tardar hasta 120 segundos en aparecer en el índice y las filas individuales conservan su caché de 300 segundos.

Una respuesta explícita de cuota diaria establece una pausa de 15 minutos para nuevas operaciones del tipo afectado; Drive/Sheets pausan generación y subida. No se repiten automáticamente operaciones ante `CUOTA_PAUSADA`. La pausa puede desaparecer si Google expulsa la caché, y terminar la pausa no significa que la cuota diaria se haya restablecido. La protección contiene tráfico fallido, no amplía cuotas.

Pasan 30 pruebas automatizadas locales, incluyendo movimiento de filas durante una operación, índice de nómina tras ordenamiento y consumo de llamadas en los caminos nuevos. No se cambió el servicio Cloud y siguen siendo dos documentos temporales por informe; el cálculo de cuota diaria anterior conserva su relevancia.

Las pruebas automatizadas locales verifican las reservas, idempotencia, recuperación, censura y el gestor de solicitudes: límites por navegador, deduplicación, lecturas durante generación, caché sin congelar el estado de entrega, límite de reintentos y rechazo de reenvíos ambiguos. Son dobles de servicios Google; no miden latencias ni cuotas reales. No se ha ejecutado carga contra producción.
