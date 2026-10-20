/** El lote utiliza las mismas reservas y recuperación que la generación individual. */
function formatearRutParaBD_(rut) { return normalizarRutCanonical_(rut); }

function inicializarLoteEnSheet(listaDatos) {
    if (!Array.isArray(listaDatos) || listaDatos.length > 100) throw new Error('El lote debe contener hasta 100 personas.');
    // Compatibilidad con la pantalla de lotes. La reserva real ocurre al procesar cada persona;
    // preparar un lote nunca monopoliza el candado ni agrega registros sin validar la dotación.
    const vistos = new Set();
    return listaDatos.map(function(dato) {
        resolverPeriodo_(dato.mesSeleccionado, dato.anio);
        const rut = normalizarRutCanonical_(dato.rut);
        if (!rut) throw new Error('Un RUT del lote es inválido.');
        const repetido = vistos.has(rut);
        vistos.add(rut);
        return { rut: rut, estado: 'SIN GENERAR', repetido: repetido };
    });
}

function procesarItemIndividualLote(dato) {
    const res = procesarInforme(dato);
    if (res.encolado || !res.exito) return res;
    return { exito: res.exito, bloqueoTotal: res.bloqueoTotal, recuperado: res.recuperado,
        links: { remu: res.urlRemu, transp: res.urlTransp, docs: res.urlDocs } };
}
