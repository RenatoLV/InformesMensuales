/** Envío voluntario. No inscribe al solicitante ni habilita informes fuera de nómina. */
function reportarRutNoEncontrado(datos) {
    if (!datos || datos.consentimiento !== true) throw new Error('Autorice el envío de sus datos para solicitar la revisión.');
    const rut=normalizarRutCanonical_(datos.rut);
    if (!rut || /^0+-/.test(rut) || rut.split('-')[1]!==digitoVerificadorRut_(rut.split('-')[0])) throw new Error('Ingrese un RUT válido.');
    const nombre=String(datos.nombre || '').trim(),correo=String(datos.correo || '').trim();
    const unidad=String(datos.unidad || '').trim(),detalle=String(datos.detalle || '').trim();
    if (nombre.length<3 || nombre.length>160 || correo.length>200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || unidad.length>200 || detalle.length>1000) throw new Error('Revise su nombre, correo y el largo de la observación.');
    const meta=obtenerMetadataSegura_(rut);
    if (meta.encontrado) throw new Error('El RUT ya figura en la nómina. Vuelva a identificarse en la plataforma.');
    if (MailApp.getRemainingDailyQuota()<1) throw new Error('No hay cuota de correo disponible. Intente más tarde.');
    const cache=CacheService.getScriptCache(),key='ALERTA_NOMINA_V1_'+rut;
    const correoKey='ALERTA_NOMINA_CONTACTO_'+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,correo.toLowerCase()));
    const reserva=conBloqueoInformes_(function(){
        const anterior=cache.get(key);
        if(anterior) return anterior==='ENVIADA'?'ENVIADA':'PENDIENTE';
        if(cache.get(correoKey)) return 'PENDIENTE';
        const total=Number(cache.get('ALERTAS_NOMINA_TOTAL') || 0);
        if(total>=30) throw new Error('Hay varias solicitudes de revisión en curso. Intente más tarde.');
        cache.put(key,'PENDIENTE',900);cache.put(correoKey,'PENDIENTE',900);
        cache.put('ALERTAS_NOMINA_TOTAL',String(total+1),900);
        return 'RESERVADA';
    });
    if(reserva==='ENVIADA')return {exito:true,repetida:true};
    if(reserva!=='RESERVADA')throw new Error('Ya existe una solicitud reciente o con envío no confirmado. Espere 15 minutos.');
    // Ante una respuesta incierta no se repite automáticamente el correo.
    MailApp.sendEmail({to:'renato.alvarez@municoquimbo.cl',replyTo:correo,
        subject:'[NÓMINA] Solicitud de revisión de RUT no encontrado',
        body:'Solicitud voluntaria de revisión de nómina\n\nRUT consultado: '+rut+
            '\nNombre declarado: '+nombre+'\nCorreo de contacto: '+correo+'\nUnidad declarada: '+(unidad || '(No indicada)')+
            '\nObservación: '+(detalle || '(Sin observaciones)')+
            '\n\nEl RUT tiene dígito verificador válido y no se encontró en la nómina vigente al comprobarlo en el servidor.'+
            '\nLos datos de contacto y unidad fueron declarados por el solicitante. Esta alerta no incorpora al funcionario ni genera informes.'});
    try{cache.put(key,'ENVIADA',900);cache.put(correoKey,'ENVIADA',900);}catch(e){console.warn('Alerta enviada; confirmación de caché pendiente.');}
    return {exito:true,repetida:false};
}
