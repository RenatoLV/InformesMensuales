const crypto = require('node:crypto');
const fallo = (status, message) => Object.assign(new Error(message), {status});
const validarId = id => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,150}$/.test(id)) throw fallo(400, 'Operación inválida');
};

// El repositorio debe ofrecer compare-and-swap; la memoria del contenedor no es autoridad.
function crearCola({repo, objetos, tareas, generar, now = Date.now, uuid = crypto.randomUUID}) {
  const leaseMs = 300000, vidaMs = 24 * 3600000;
  async function actualizar(id, transformar) {
    for (let i = 0; i < 8; i++) {
      const anterior = await repo.leer(id);
      const nuevo = transformar(anterior && anterior.valor);
      if (!nuevo) return anterior && anterior.valor;
      if (await repo.cas(id, anterior && anterior.version, nuevo)) return nuevo;
    }
    throw fallo(429, 'Operación ocupada');
  }
  async function despachar(id, job) {
    if (!job || ['LISTO', 'ERROR', 'ARCHIVADO'].includes(job.estado)) return;
    // Outbox: repetir tras una caída entre persistencia y createTask es seguro.
    // Un nombre por ventana permite recuperar una tarea agotada o eliminada.
    await tareas.crear(id, Math.floor(now() / 300000));
  }
  async function enviar(id, payload) {
    validarId(id);
    if (!payload || payload.documentosHTML?.motor !== 'HTML' ||
        !payload.documentosHTML.remuneraciones || !payload.documentosHTML.transparencia) {
      throw fallo(400, 'La cola requiere ambas versiones HTML');
    }
    const texto = JSON.stringify(payload);
    if (Buffer.byteLength(texto) > 700000) throw fallo(400, 'Informe demasiado grande');
    const firma = crypto.createHash('sha256').update(texto).digest('hex');
    // Objeto inmutable; también compara contenido ante un reenvío conflictivo.
    await objetos.ponerSolicitud(id, texto);
    const job = await actualizar(id, previo => {
      if (previo) {
        if (previo.firma !== firma) throw fallo(409, 'Operación usada con otros datos');
        return null;
      }
      return {firma, estado:'EN_COLA', intentos:0, creado:now(), actualizado:now(),
        expiresAt:new Date(now() + 30 * 86400000).toISOString()};
    });
    // Si falla Tasks, el documento queda pendiente y el reconciliador lo reenvía.
    await despachar(id, job);
    return {id, estado:job.estado};
  }
  async function ejecutar(id) {
    validarId(id);
    const owner = uuid();
    let job = await actualizar(id, previo => {
      if (!previo) throw fallo(404, 'Operación inexistente');
      if (['LISTO', 'ERROR', 'ARCHIVADO'].includes(previo.estado)) return null;
      if (previo.vence > now()) throw fallo(429, 'Operación en ejecución');
      if (previo.intentos >= 8 || now() - previo.creado > vidaMs) {
        return {...previo, estado:'ERROR', error:'Se agotó el plazo o los intentos. Requiere revisión.', actualizado:now()};
      }
      return {...previo, estado:'PROCESANDO', owner, vence:now() + leaseMs,
        intentos:previo.intentos + 1, actualizado:now()};
    });
    if (job.owner !== owner || job.estado !== 'PROCESANDO') return;
    try {
      // Resultado persistido antes de confirmar LISTO: una caída no vuelve a renderizar.
      let resultado = await objetos.leerResultado(id);
      if (!resultado) {
        const payload = JSON.parse(await objetos.leerSolicitud(id));
        resultado = await generar(payload, id);
        await objetos.ponerResultado(id, JSON.stringify(resultado));
      }
      job = await actualizar(id, actual => actual.owner === owner && actual.estado === 'PROCESANDO'
        ? {...actual, estado:'LISTO', vence:0, actualizado:now()} : null);
    } catch (error) {
      await actualizar(id, actual => actual.owner === owner && actual.estado === 'PROCESANDO'
        ? {...actual, estado:actual.intentos >= 8 || error.status === 400 ? 'ERROR' : 'EN_COLA',
          error:'No se pudo completar el PDF.', vence:0, actualizado:now()} : null);
      throw error;
    }
  }
  async function estados(ids, reparar = false) {
    if (!Array.isArray(ids) || ids.length > 50) throw fallo(400, 'Hasta 50 operaciones por consulta');
    ids.forEach(validarId);
    return Promise.all(ids.map(async id => {
      let job = (await repo.leer(id))?.valor;
      if (job && !['LISTO','ERROR','ARCHIVADO'].includes(job.estado) && now() - job.creado > vidaMs && !(job.vence > now())) {
        job = await actualizar(id, actual => actual.estado === 'EN_COLA' ||
          (actual.estado === 'PROCESANDO' && !(actual.vence > now()))
          ? {...actual, estado:'ERROR', error:'Plazo de generación agotado.', actualizado:now()} : null);
      }
      if (reparar) await despachar(id, job);
      return {id, estado:job?.estado || 'NO_EXISTE', error:job?.estado === 'ERROR' ? job.error : undefined};
    }));
  }
  async function resultado(id) {
    validarId(id);
    const job = (await repo.leer(id))?.valor;
    if (!job || job.estado !== 'LISTO') throw fallo(409, 'PDF todavía no disponible');
    const value = await objetos.leerResultado(id);
    if (!value) throw fallo(410, 'Resultado temporal vencido; requiere revisión');
    return value;
  }
  return {enviar, ejecutar, estados, resultado};
}
module.exports = {crearCola};
