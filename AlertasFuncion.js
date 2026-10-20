/** Solicitud explícita del funcionario. Nunca se envía al consultar o abrir el formulario. */
function reportarFuncionContrato(datos) {
    if (!datos || !['VACIA', 'INCORRECTA'].includes(datos.motivo) || String(datos.detalle || '').length > 1000) throw new Error('Indique el motivo y un detalle de hasta 1.000 caracteres.');
    const rut = normalizarRutCanonical_(datos.rut);
    if (!/^\d{8}-[0-9K]$/.test(rut)) throw new Error('Identifíquese antes de enviar la alerta.');
    const meta = obtenerMetadataSegura_(rut);
    if (!meta.encontrado) throw new Error('El funcionario no pertenece a la dotación vigente.');
    const periodo = resolverPeriodo_(datos.mes, datos.anio);
    const key = 'ALERTA_FUNCION_V1_' + periodo.anio + '_' + periodo.mes + '_' + rut;
    const token = Utilities.getUuid();
    const cache = CacheService.getScriptCache();
    const reservada = conBloqueoInformes_(() => {
        const previo = cache.get(key);
        if (previo) {
            let estado; try { estado = JSON.parse(previo).estado; } catch(e) {}
            return estado === 'ENVIADA' ? 'ENVIADA' : 'PENDIENTE';
        }
        cache.put(key, JSON.stringify({token:token, estado:'PENDIENTE'}), 900); return 'RESERVADA';
    });
    if (reservada === 'ENVIADA') return {exito:true, repetida:true};
    if (reservada === 'PENDIENTE') throw new Error('Hay una alerta en curso o con envío no confirmado. Espere 15 minutos antes de intentar otra.');
    try {
        if (MailApp.getRemainingDailyQuota() < 1) throw new Error('No hay cuota de correo disponible. Intente más tarde.');
        const correo = String(datos.correo || meta.email || '').trim();
        const fono = String(datos.fono || meta.fono || '').trim();
        if (correo.length > 200 || fono.length > 50) throw new Error('Revise los datos de contacto.');
        MailApp.sendEmail({to:'renato.alvarez@municoquimbo.cl',
            subject:'[FUNCIÓN CONTRATO] ' + (datos.motivo === 'VACIA' ? 'Vacía' : 'Incorrecta') + ' — ' + String(meta.nombre).replace(/[\r\n]/g,' ').substring(0,120),
            body:'Solicitud de revisión de función de contrato\n\n' +
                'Funcionario: ' + meta.nombre + '\nRUT: ' + rut + '\nPrograma: ' + (meta.programa || '') +
                '\nUnidad: ' + (meta.direccion || '') + '\nPeríodo: ' + periodo.mes + ' ' + periodo.anio +
                '\nCorreo de contacto: ' + correo + '\nTeléfono: ' + fono +
                '\nMotivo informado: ' + (datos.motivo === 'VACIA' ? 'Función vacía' : 'Función incorrecta') +
                '\nFunción registrada en la nómina: ' + (meta.funcion || '(VACÍA)') +
                '\nObservación del funcionario: ' + (datos.detalle || '(Sin observaciones)')});
        try { cache.put(key, JSON.stringify({token:token, estado:'ENVIADA'}), 900); } catch(e) { console.warn('Correo enviado; no se pudo confirmar en caché.'); }
        return {exito:true, repetida:false};
    } catch(e) {
        // Un rechazo antes del envío libera la reserva. Un envío ambiguo conserva la pausa.
        if (/cuota|contacto/i.test(String(e.message || e))) {
            conBloqueoInformes_(() => {
                const actual = cache.get(key);
                if (actual && JSON.parse(actual).token === token) cache.remove(key);
            });
        }
        throw e;
    }
}
