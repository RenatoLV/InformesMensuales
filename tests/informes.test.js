const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');

test('la práctica desvía identificación y entregas sin tocar servicios ni almacenamiento', async () => {
    const acciones = [];
    const bloquear = () => { throw new Error('La práctica intentó usar datos o servicios reales.'); };
    const context = vm.createContext({
        console, tutorialActivo: true,
        document: { addEventListener() {}, getElementById: bloquear },
        sessionStorage: { getItem: bloquear, setItem: bloquear, removeItem: bloquear },
        google: { script: { get run() { return bloquear(); } } },
        TutorialPractico: Object.fromEntries(['identificar', 'jefatura', 'generar', 'entregar', 'terminar']
            .map(nombre => [nombre, () => acciones.push(nombre)]))
    });
    for (const f of ['JS_RESILIENCIA.html', 'JS_STATE.html', 'JS_INFORMES.html', 'JS_ACTIONS.html']) {
        const source = fs.readFileSync(path.join(root, f), 'utf8');
        for (const m of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], context);
    }
    context.buscar();
    context.autocompletarJefatura('JEFATURA DE EJEMPLO');
    context.decidirGeneracion();
    context.continuarSinGeneracion();
    await context.generarIndividual();
    context.finalizarIndividual();
    context.finalizarIndividualDual();
    context.guardarBorradorInforme();
    context.limpiarStorageCompleto();
    context.abrirModalReporte();
    context.enviarCorreoReporte();
    await context.intentarSalir();
    context.resetearAplicacionCompleta();
    await assert.rejects(context.solicitarBackend('procesarInforme', {}), /práctica no realiza operaciones/);
    assert.deepEqual(acciones, ['identificar', 'jefatura', 'generar', 'generar', 'generar', 'entregar', 'entregar', 'terminar', 'terminar']);
});

function entorno() {
    const rows = [], properties = { CLOUD_RUN_API_KEY: 'test-key', CLOUD_PDF_MOTOR:'DOCS' }, cache = {}, files = new Map(), docs = new Map();
    let locked = false, generated = 0, cloudCalls = 0, creates = 0;
    const consumo = {busquedas:0, lecturasDrive:0, reservasIds:0};
    const range = (r, c, nr = 1, nc = 1) => ({
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')),
        getValue: () => rows[r - 1]?.[c - 1] ?? '',
        setValue(v) { this.setValues([[v]]); },
        setValues(values) { values.forEach((row, i) => { rows[r - 1 + i] ||= []; row.forEach((v, j) => rows[r - 1 + i][c - 1 + j] = v); }); },
        createTextFinder(pattern) {
            consumo.busquedas++;
            let regex = false, entire = false;
            return {
                useRegularExpression(v) { regex = v; return this; }, matchCase() { return this; },
                matchEntireCell(v) { entire = v; return this; },
                findAll: () => rows.slice(r - 1, r - 1 + nr).flatMap((row, i) => {
                    const val = String(row[c - 1] ?? '');
                    const found = regex ? new RegExp(pattern, 'i').test(val) : entire ? val === pattern : val.includes(pattern);
                    return found ? [{ getRow: () => r + i }] : [];
                })
            };
        }
    });
    const sheet = { getLastRow: () => rows.length, getMaxColumns: () => 26, getRange: range, setFrozenRows() {}, getName: () => 'REGISTRO_HISTORICO' };
    const text = () => ({ value: '{{Nombre}} {{Rut}} {{fecha}} {{FONO}} {{CORREO}} {{informe_glosa}} {{funcion}} {{LICENCIA}} {{ENFERMEDAD}}',
        replaceText(pattern, replacement) { this.value = this.value.replace(new RegExp(pattern, 'g'), replacement); }, findText() { return null; } });
    const folder = id => ({ getId: () => id, getFilesByName: name => {
        const found = [...files.values()].filter(f => f.name === name && f.parent === id);
        return { hasNext: () => found.length > 0, next: () => ({ getId: () => found[0].id }) };
    } });
    const context = vm.createContext({ console, Date, Intl, JSON, Set, Map,
        MailApp: {getRemainingDailyQuota:()=>10, sendEmail:datos=>{ context.correos.push(datos); }},
        Utilities: {
            getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' },
            formatDate: (d, tz, fmt) => {
                const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
                const part = t => p.find(x => x.type === t).value;
                return fmt === 'yyyy' ? part('year') : fmt === 'MM' ? part('month') : `${part('day')}/${part('month')}/${part('year')}`;
            },
            computeDigest: (_, val) => [...crypto.createHash('sha256').update(typeof val === 'string' ? val : Buffer.from(val)).digest()],
            base64EncodeWebSafe: val => Buffer.from(val).toString('base64url'),
            base64Encode: val => Buffer.from(val).toString('base64'),
            base64Decode: val => [...Buffer.from(val, 'base64')],
            newBlob: bytes => ({ bytes, getBytes: () => [...Buffer.from(bytes)] })
        },
        PropertiesService: { getScriptProperties: () => ({ getProperty: k => properties[k] ?? null, setProperty: (k, v) => properties[k] = v }) },
        CacheService: { getScriptCache: () => ({ get: k => cache[k], put: (k, v) => cache[k] = v, remove: k => delete cache[k] }) },
        LockService: { getScriptLock: () => ({ tryLock: () => { if (locked) return false; locked = true; return true; }, releaseLock: () => locked = false }) },
        SpreadsheetApp: { openById: () => ({ getSheetByName: () => rows.length ? sheet : null, insertSheet: () => sheet }), flush() {} },
        DriveApp: { getFileById: id => ({
            makeCopy: (name, parent) => { creates++; const id = 'doc-' + ++generated; files.set(id, { id, name, parent: parent.getId() }); docs.set(id, [text(), text(), text()]); return { getId: () => id }; },
            setTrashed: v => { if (files.has(id)) files.get(id).trashed = v; },
            getBlob: () => ({getDataAsString:()=>String(files.get(id)?.blob?.bytes || '')}),
            getAs: () => ({ bytes: [...Buffer.from('%PDF-1.7\nrecuperado')] })
        }) },
        DocumentApp: { openById: id => ({ getBody: () => docs.get(id)[0], getHeader: () => docs.get(id)[1], getFooter: () => docs.get(id)[2], saveAndClose() {} }) },
        Drive: { Files: {
            generateIds: ({ count }) => { consumo.reservasIds++; return { ids: Array.from({ length: count }, () => 'pdf-' + ++generated) }; },
            get: id => { consumo.lecturasDrive++; if (!files.has(id)) throw new Error('404 File not found'); return files.get(id); },
            create: (metadata, blob) => { if (files.has(metadata.id)) throw new Error('409'); creates++; files.set(metadata.id, { ...metadata, blob }); }
        } },
        UrlFetchApp: { fetch: () => { cloudCalls++; return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ exito: true, pdfRemuBase64: Buffer.from('%PDF-1.7\nremu').toString('base64'), pdfTranspBase64: Buffer.from('%PDF-1.7\ntransp').toString('base64') }) }; } }
    });
    context.correos=[];
    for (const f of ['Main.js', 'Concurrencia.js', 'FormatoActividades.js', 'Utils.js', 'PlantillaCloud.js', 'ConexionCloud.js', 'Logica.js', 'ColaPDF.js', 'Masivo.js', 'Soporte.js', 'AlertasFuncion.js', 'AlertasNomina.js', 'RecepcionMasiva.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
    properties.CLOUD_CONFIG_FILE_APLICADO = vm.runInContext('CONFIG.CLOUD_CONFIG_FILE',context);
    context.obtenerMetadataSegura_ = () => ({ encontrado: true, nombre: 'Funcionario de Prueba', nacimiento: '01/01/1990', direccion: 'Dirección / Departamento', funcion:'Administración municipal' });
    context.crearEstructuraCarpetas_ = () => ({ docs: folder('docs'), generados: folder('generados'), transp: folder('transp'), remu: folder('remu') });
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', month: '2-digit', year: 'numeric' }).formatToParts(new Date());
    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const mes = meses[Number(now.find(p => p.type === 'month').value) - 1], anio = Number(now.find(p => p.type === 'year').value);
    const data = { rut: '09.222.054-0', nombre: 'Funcionario de Prueba', mesSeleccionado: mes, anio,
        funcion: 'Administración municipal', actividades: 'Actividades realizadas durante el mes.', fono: '+56 9 1234 5678',
        correo: 'prueba@example.test', nacimiento: '01/01/1990', jefaturaNombre: 'Jefatura de Prueba', jefaturaCargo: 'Director',
        datoLicencia: '03/10/2026 al 04/10/2026', datoEnfermedad: 'Motivo de salud sensible' };
    return { context, rows, files, docs, data, properties, consumo, get calls() { return cloudCalls; }, get creates() { return creates; } };
}

function recepcion(e) {
    e.properties.RECEPCION_ADMIN_EMAILS='admin@example.test';
    e.context.Session={getActiveUser:()=>({getEmail:()=> 'admin@example.test'})};
    return {rut:e.data.rut, mes:e.data.mesSeleccionado, anio:e.data.anio, loteId:'lote_prueba_001', revisado:true,
        remu:{origen:'local',base64:Buffer.from('%PDF-1.7\nremuneraciones firmadas').toString('base64')},
        transp:{origen:'local',base64:Buffer.from('%PDF-1.7\ntransparencia revisada').toString('base64')}};
}
function activarColaPrueba(e) {
    Object.assign(e.properties,{CLOUD_PDF_MOTOR:'HTML',COLA_PDF_ACTIVA:'true',
        COLA_PDF_URL:'https://cola-example-uc.a.run.app',COLA_PDF_OUTBOX_FOLDER_ID:'outbox'});
}
test('cola acepta más solicitudes que cupos de render sin renderizar ni mantener reservas activas',()=>{
    const e=entorno();activarColaPrueba(e);
    for(let i=0;i<100;i++){
        const r=e.context.procesarInforme({...e.data,rut:String(10000000+i)+'-K'});
        assert(r.encolado);assert(r.ticket);
    }
    assert.equal(e.rows.length,101);assert.equal(e.docs.size,0);
    assert.deepEqual(JSON.parse(e.properties.INFORMES_ACTIVOS),{});
    assert.equal(e.creates,100); // Solo outbox, ningún PDF/Docs.
});
test('cola conserva ticket, bloquea carga rival y corrección de contenido mientras está pendiente',()=>{
    const e=entorno();activarColaPrueba(e);
    const r=e.context.procesarInforme(e.data);
    assert.equal(e.context.procesarInforme(e.data).ticket,r.ticket);
    assert.throws(()=>e.context.reservarOperacion_(e.data,'subida'),/EN_COLA/);
    assert.throws(()=>e.context.procesarInforme({...e.data,actividades:'Otras actividades realizadas.'}),/otros datos/);
    e.context.SpreadsheetApp.openById=()=>{throw new Error('No debe leer Sheets para consultar caché');};
    assert.equal(e.context.consultarGeneracionPDF(r.ticket).ticket,r.ticket);
});
test('respuesta perdida al encolar no pierde aceptación ni exige otro render manual',()=>{
    const e=entorno();activarColaPrueba(e);
    e.context.UrlFetchApp.fetch=()=>{throw new Error('timeout');};
    const r=e.context.procesarInforme(e.data);
    assert(r.encolado);assert.equal(e.creates,1);
    assert.equal(e.context.procesarInforme(e.data).ticket,r.ticket);
    assert.equal(JSON.parse(e.rows[1][22]).cola.pendiente,true);
});
test('finalización de cola recupera segundo PDF fallido sin duplicar el primero',()=>{
    const e=entorno();activarColaPrueba(e);
    const r=e.context.procesarInforme(e.data), c=JSON.parse(e.rows[1][22]);
    const resultado={pdfRemuBase64:Buffer.from('%PDF-1.7\nremu').toString('base64'),pdfTranspBase64:Buffer.from('%PDF-1.7\ntransp').toString('base64')};
    const crear=e.context.Drive.Files.create;let n=0;
    e.context.Drive.Files.create=(...args)=>{if(++n===2)throw new Error('Corte');return crear(...args);};
    assert.throws(()=>e.context.finalizarColaPDF_(c,resultado),/Corte/);
    assert.equal(e.rows[1][5],'EN COLA');
    e.context.Drive.Files.create=crear;
    e.context.finalizarColaPDF_(c,resultado);
    assert.equal(e.creates,3); // Outbox + dos PDF.
    assert.equal(e.rows[1][5],'GENERADO (PENDIENTE FIRMA)');
    const estado=e.context.consultarGeneracionPDF(r.ticket);
    assert(estado.urlRemu);assert(estado.urlTransp);assert(!estado.encolado);
    e.context.finalizarColaPDF_(c,resultado);assert.equal(e.creates,3);
});
test('reconciliador reenvía outbox sin navegador, finaliza y deja de consultar al quedar vacío',()=>{
    const e=entorno();activarColaPrueba(e);e.context.procesarInforme(e.data);
    let existe=false,listo=false,envios=0,lecturas=0;
    e.context.cloudCola_=(ruta,p)=>{
        if(ruta==='/cola/estados'){lecturas++;return p.ids.map(id=>({id,estado:existe?(listo?'LISTO':'EN_COLA'):'NO_EXISTE'}));}
        if(ruta==='/cola'){envios++;existe=true;assert(p.payload.documentosHTML);return {};}
        return {pdfRemuBase64:Buffer.from('%PDF-1.7\nremu').toString('base64'),pdfTranspBase64:Buffer.from('%PDF-1.7\ntransp').toString('base64')};
    };
    e.context.reconciliarColaPDF_();assert.equal(envios,1);assert.equal(e.rows[1][5],'EN COLA');
    listo=true;e.context.reconciliarColaPDF_();assert.equal(e.rows[1][5],'GENERADO (PENDIENTE FIRMA)');
    e.context.reconciliarColaPDF_();assert.equal(e.properties.COLA_HAY_PENDIENTES,'false');
    e.context.SpreadsheetApp.openById=()=>{throw new Error('No debe leer con cola vacía');};
    e.context.reconciliarColaPDF_();assert.equal(lecturas,2);
});
test('error terminal de cola se informa y conserva la exclusión mensual',()=>{
    const e=entorno();activarColaPrueba(e);const r=e.context.procesarInforme(e.data);
    e.context.cloudCola_=(ruta,p)=>p.ids.map(id=>({id,estado:'ERROR',error:'Ocho intentos agotados'}));
    e.context.reconciliarColaPDF_();
    assert.equal(e.rows[1][5],'COLA REQUIERE REVISION');
    assert.equal(e.context.consultarGeneracionPDF(r.ticket).exito,false);
    assert.throws(()=>e.context.reservarOperacion_(e.data,'subida'),/EN_COLA/);
    assert.equal(e.context.procesarInforme(e.data).exito,false);
});
test('metadata repetida evita abrir nómina y no cachea ausencias o errores',()=>{
    const e=entorno();vm.runInContext(fs.readFileSync(path.join(root,'Datos.js'),'utf8'),e.context);
    let consultas=0;
    e.context.cargarFuncionario_=()=>{consultas++;return {encontrado:true,nombre:'Ejemplo',funcion:'Función'};};
    assert(e.context.obtenerMetadataSegura_(e.data.rut).encontrado);
    assert(e.context.obtenerMetadataSegura_(e.data.rut).encontrado);assert.equal(consultas,1);
    e.context.cargarFuncionario_=()=>{consultas++;return {encontrado:false};};
    e.context.obtenerMetadataSegura_('12345678-5');e.context.obtenerMetadataSegura_('12345678-5');
    assert.equal(consultas,3);
});
test('recepción masiva exige identidad de visitante y lista de acceso antes de leer servicios',()=>{
    const e=entorno(),d=recepcion(e);
    e.context.Session={getActiveUser:()=>({getEmail:()=>''}),getEffectiveUser:()=>({getEmail:()=> 'admin@example.test'})};
    for(const fn of ['obtenerCatalogoRecepcionMasiva','listarCarpetaRecepcionMasiva','consultarEstadoRecepcionMasiva','registrarParRecepcionMasiva']){
        assert.throws(()=>e.context[fn](d),/ACCESO_DENEGADO/);
    }
    assert.equal(e.creates,0);assert.equal(e.rows.length,0);
    e.context.Session.getActiveUser=()=>({getEmail:()=> 'visitante@example.test'});
    assert.throws(()=>e.context.registrarParRecepcionMasiva(d),/ACCESO_DENEGADO/);
});
test('recepción registra ambos PDF sin generar, conserva auditoría y recupera una repetición idéntica',()=>{
    const e=entorno(),d=recepcion(e),c=e.context;
    const r=c.registrarParRecepcionMasiva(d);
    assert(r.exito);assert(r.remu);assert(r.transp);assert.equal(e.calls,0);assert.equal(e.docs.size,0);assert.equal(e.creates,2);
    assert.equal(e.rows[1][5],'FINALIZADO (OK)');
    const control=JSON.parse(e.rows[1][22]);assert.equal(control.recepcionMasiva.autor,'admin@example.test');assert.equal(control.recepcionMasiva.loteId,d.loteId);
    assert(c.registrarParRecepcionMasiva(d).recuperado);assert.equal(e.creates,2);
    assert(c.procesarInforme(e.data).bloqueoTotal);assert.equal(e.calls,0);
    assert.throws(()=>c.registrarParRecepcionMasiva({...d,remu:{origen:'local',base64:Buffer.from('%PDF-1.7\notro').toString('base64')}}),/otra entrega/);
    assert.equal(e.creates,2);
});
test('recepción bloquea mismo contenido, RUT inválido y falta de revisión antes de reservar',()=>{
    const e=entorno(),d=recepcion(e);
    assert.throws(()=>e.context.registrarParRecepcionMasiva({...d,transp:d.remu}),/mismo contenido/);
    assert.throws(()=>e.context.registrarParRecepcionMasiva({...d,rut:'12345678-9'}),/Revise/);
    assert.throws(()=>e.context.registrarParRecepcionMasiva({...d,revisado:false}),/Revise/);
    assert.equal(e.rows.length,0);assert.equal(e.creates,0);
});
test('recepción recupera fallo tras el primer PDF sin duplicarlo ni marcar completo antes de tiempo',()=>{
    const e=entorno(),d=recepcion(e),create=e.context.Drive.Files.create;
    let llamadas=0;
    e.context.Drive.Files.create=(...a)=>{if(++llamadas===2)throw new Error('Fallo de escritura');return create(...a);};
    assert.throws(()=>e.context.registrarParRecepcionMasiva(d),/Fallo de escritura/);
    assert.equal(e.creates,1);assert(!e.rows[1][5].includes('FINALIZADO'));
    e.context.Drive.Files.create=create;
    assert(e.context.registrarParRecepcionMasiva(d).exito);
    assert.equal(e.creates,2);assert.equal(e.rows[1][5],'FINALIZADO (OK)');
});
test('recepción Drive pagina y rechaza cambios de versión y archivos grandes antes de descargarlos',()=>{
    const e=entorno();recepcion(e);
    let opciones,descargas=0;
    e.context.Drive.Files.get=()=>({id:'folder-123456',mimeType:'application/vnd.google-apps.folder',driveId:'drive-123456'});
    e.context.Drive.Files.list=o=>{opciones=o;return {files:[{id:'pdf-123456789'}],nextPageToken:'siguiente'};};
    const r=e.context.listarCarpetaRecepcionMasiva('https://drive.google.com/drive/folders/folder-123456','pagina');
    assert.equal(opciones.pageSize,100);assert.equal(opciones.pageToken,'pagina');assert.equal(opciones.driveId,'drive-123456');assert.equal(r.siguiente,'siguiente');
    e.context.DriveApp.getFileById=()=>({getBlob:()=>{descargas++;return {getBytes:()=>[...Buffer.from('%PDF-1.7\narchivo')]};}});
    e.context.Drive.Files.get=()=>({mimeType:'application/pdf',size:'99',version:'2'});
    assert.throws(()=>e.context.leerPdfRecepcion_({origen:'drive',id:'pdf-123456789',version:'1'}),/cambió/);
    e.context.Drive.Files.get=()=>({mimeType:'application/pdf',size:String(6*1024*1024),version:'1'});
    assert.throws(()=>e.context.leerPdfRecepcion_({origen:'drive',id:'pdf-123456789',version:'1'}),/5 MB/);
    assert.equal(descargas,0);
    let n=0;e.context.Drive.Files.get=()=>({mimeType:'application/pdf',size:'99',version:++n===1?'1':'2'});
    assert.throws(()=>e.context.leerPdfRecepcion_({origen:'drive',id:'pdf-123456789',version:'1'}),/durante la lectura/);
});

test('los puntos de control no buscan de nuevo el RUT; si se mueve la fila la recuperan sin pisar otra', () => {
    const e=entorno(), c=e.context;
    const a=c.reservarOperacion_(e.data,'generacion');
    c.reservarOperacion_({...e.data,rut:'12345678-5'},'generacion');
    const antes=e.consumo.busquedas;
    c.guardarPuntoControl_(a,'FASE UNO');
    assert.equal(e.consumo.busquedas,antes);
    assert.equal(e.rows[1][5],'GENERANDO');
    [e.rows[1],e.rows[2]]=[e.rows[2],e.rows[1]];
    const otroControl=e.rows[1][22];
    c.guardarPuntoControl_(a,'FASE DOS');
    assert.equal(a.row,3);
    assert.equal(e.rows[1][22],otroControl);
    assert.equal(JSON.parse(e.rows[2][22]).fase,'FASE DOS');
});

test('Drive no consulta los PDF recién reservados y reserva ambos adjuntos duales en una llamada', () => {
    const e=entorno(); e.context.procesarInforme(e.data);
    assert.equal(e.consumo.lecturasDrive,0);
    assert.equal(e.consumo.reservasIds,1);
    const pdf=Buffer.from('%PDF-1.7\nadjunto').toString('base64');
    e.context.guardarArchivosDual({rut:e.data.rut,mes:e.data.mesSeleccionado,anio:e.data.anio,
        rawTransp:pdf,rawBoleta:pdf,mimeTransp:'application/pdf',mimeBoleta:'application/pdf'});
    assert.equal(e.consumo.reservasIds,2);
    assert.equal(e.consumo.lecturasDrive,0);
    assert.equal(e.creates,6);
});

test('HTML genera los dos PDF sin Docs, censura texto con formato y reutiliza el mes', () => {
    const e=entorno(),c=e.context;
    e.properties.CLOUD_PDF_MOTOR='HTML';
    e.data.jefaturaDireccion='DIRECCIÓN DE DESARROLLO COMUNITARIO';
    const texto='Consulta al RUT 09.222.054-0 y prueba@example.test';
    e.data.actividades=texto;
    e.data.actividadesFormato=JSON.stringify({ops:[{insert:'Consulta al RUT 09.222.',attributes:{bold:true}},
        {insert:'054-0 y prueba@example.test\n',attributes:{italic:true}}]});
    let payload;
    const fetch=c.UrlFetchApp.fetch;
    c.UrlFetchApp.fetch=(url,options)=>{payload=JSON.parse(options.payload);return fetch(url,options);};
    c.DocumentApp.openById=()=>{throw new Error('HTML no debe usar Docs');};
    assert.equal(c.procesarInforme(e.data).exito,true);
    assert.equal(e.docs.size,0); assert.equal(e.creates,2); assert.equal(e.calls,1);
    const publico=JSON.stringify(payload.documentosHTML.transparencia);
    assert.equal(payload.documentosHTML.remuneraciones.DirJefatura,e.data.jefaturaDireccion);
    assert.equal(payload.documentosHTML.transparencia.DirJefatura,e.data.jefaturaDireccion);
    assert.doesNotMatch(publico,/9222054|9\.222\.054|example\.test|1990|Motivo de salud/);
    assert.match(publico,/\[\[RESERVADO\]\]/);
    assert.equal(payload.documentosHTML.transparencia.FONO,'');
    assert.equal(payload.documentosHTML.transparencia.CORREO,'');
    assert.equal(payload.documentosHTML.transparencia.transparencia,true);
    assert.equal(payload.documentosHTML.remuneraciones.lineasActividades[0].segmentos[0].atributos.bold,true);
    assert.equal(payload.documentosHTML.transparencia.tieneLicencia,undefined);
    assert.equal(c.procesarInforme(e.data).recuperado,true);assert.equal(e.calls,1);
});

test('la alerta de nómina requiere autorización y RUT válido; no envía para funcionarios que sí están registrados',()=>{
    const e=entorno(),datos={rut:'12345678-5',nombre:'Solicitante de prueba',correo:'solicitante@example.test',consentimiento:true};
    assert.throws(()=>e.context.reportarRutNoEncontrado({...datos,consentimiento:false}),/Autorice/);
    assert.throws(()=>e.context.reportarRutNoEncontrado({...datos,rut:'12345678-0'}),/RUT válido/);
    assert.throws(()=>e.context.reportarRutNoEncontrado(datos),/ya figura/);assert.equal(e.context.correos.length,0);
});
test('la alerta voluntaria de nómina envía al destino fijo una sola vez, sin inscribir ni generar informes',()=>{
    const e=entorno();e.context.obtenerMetadataSegura_=()=>({encontrado:false});
    const datos={rut:'12.345.678-5',nombre:'Solicitante de prueba',correo:'solicitante@example.test',unidad:'Unidad de prueba',detalle:'Solicito revisar mi incorporación.',consentimiento:true,to:'otro@example.test'};
    assert.equal(e.context.reportarRutNoEncontrado(datos).exito,true);assert.equal(e.context.reportarRutNoEncontrado(datos).repetida,true);
    assert.equal(e.context.correos.length,1);assert.equal(e.context.correos[0].to,'renato.alvarez@municoquimbo.cl');
    assert.equal(e.context.correos[0].replyTo,datos.correo);assert.match(e.context.correos[0].body,/12345678-5/);
    assert.equal(e.rows.length,0);assert.equal(e.creates,0);assert.equal(e.calls,0);
});
test('una falla de envío de alerta de nómina no se repite ante respuesta incierta',()=>{
    const e=entorno();e.context.obtenerMetadataSegura_=()=>({encontrado:false});let intentos=0;
    e.context.MailApp.sendEmail=()=>{intentos++;throw new Error('timeout');};
    const datos={rut:'12345678-5',nombre:'Solicitante de prueba',correo:'solicitante@example.test',consentimiento:true};
    assert.throws(()=>e.context.reportarRutNoEncontrado(datos),/timeout/);
    assert.throws(()=>e.context.reportarRutNoEncontrado(datos),/reciente/);assert.equal(intentos,1);
});

test('HTML recupera una escritura parcial con IDs persistentes sin recurrir a Docs', () => {
    const e=entorno(),c=e.context;
    e.properties.CLOUD_PDF_MOTOR='HTML';
    const create=c.Drive.Files.create;let count=0;
    c.Drive.Files.create=(...args)=>{if(++count===2)throw new Error('503');return create(...args);};
    c.DriveApp.getFileById=()=>{throw new Error('No convertir un Doc en recuperación HTML');};
    assert.throws(()=>c.procesarInforme(e.data),/503/);
    e.properties.CLOUD_PDF_MOTOR='DOCS';
    assert.equal(c.procesarInforme(e.data).exito,true);
    assert.equal(e.creates,2);assert.equal(e.docs.size,0);assert.equal(e.consumo.reservasIds,1);
});

test('un rechazo explícito de Cloud por ocupación permite reintentar sin dejar una respuesta ambigua', () => {
    const e=entorno(),c=e.context;
    e.properties.CLOUD_PDF_MOTOR='HTML';const fetch=c.UrlFetchApp.fetch;
    c.UrlFetchApp.fetch=()=>({getResponseCode:()=>429});
    assert.throws(()=>c.procesarInforme(e.data),/OCUPADO:/);
    assert.equal(JSON.parse(e.rows[1][22]).archivos.cloudPendiente,false);
    c.UrlFetchApp.fetch=fetch;
    assert.equal(c.procesarInforme(e.data).exito,true);assert.equal(e.creates,2);
});

test('tras un 401 HTML sin archivos permite corregir la jefatura y conserva un solo registro mensual',()=>{
    const e=entorno(),c=e.context;e.properties.CLOUD_PDF_MOTOR='HTML';const fetch=c.UrlFetchApp.fetch;
    c.UrlFetchApp.fetch=()=>({getResponseCode:()=>401});
    assert.throws(()=>c.procesarInforme(e.data),/CONFIGURACION_CLOUD/);
    const idAnterior=JSON.parse(e.rows[1][22]).id;
    c.UrlFetchApp.fetch=fetch;
    const resultado=c.procesarInforme({...e.data,jefaturaNombre:'Nueva jefatura manual',jefaturaCargo:'Coordinador territorial'});
    assert.equal(resultado.exito,true);assert.equal(e.rows.length,2);assert.equal(e.creates,2);assert.notEqual(JSON.parse(e.rows[1][22]).id,idAnterior);
});

test('un error explícito de cuota pausa nuevas generaciones sin bloquear subidas por cuota de Docs', () => {
    const e=entorno(),c=e.context;
    c.registrarPausaCuota_(new Error('Network timeout'),'generacion');
    c.comprobarCupoInformes_('generacion');
    c.registrarPausaCuota_(new Error('Service invoked too many times: Documents.'),'generacion');
    assert.throws(()=>c.procesarInforme(e.data),/CUOTA_PAUSADA/);
    c.comprobarCupoInformes_('subida');
    assert.equal(e.creates,0);
    assert.equal(e.calls,0);
});

test('la validación para generar usa nómina sin consultar historial ni catálogo de jefaturas', () => {
    const e=entorno(),c=e.context;
    vm.runInContext(fs.readFileSync(path.join(root,'Datos.js'),'utf8'),c);
    c.SpreadsheetApp.openById=()=>({getSheetByName:()=>({})});
    c.obtenerNombreHojaMasReciente_=()=> 'DOTACION';
    c.leerFilaDotacion_=()=>[['RUT','NOMBRE COMPLETO','FECHA DE NACIMIENTO','FUNCION','DIRECCION'],
        ['12345678-5','Funcionario ficticio','01/01/1990','Apoyo municipal','Unidad']];
    c.obtenerJefaturaPorDireccion_=()=>{throw new Error('No debe leer jefaturas');};
    c.verificarExistenciaEnLog_=()=>{throw new Error('No debe leer historial');};
    const meta=c.obtenerMetadataSegura_('12345678-5');
    assert.equal(meta.encontrado,true);
    assert.equal(meta.nombre,'Funcionario ficticio');
    assert.equal(meta.direccion,'Unidad');
});

test('la función del informe siempre procede de nómina aunque el navegador envíe otra', () => {
    const e=entorno();
    e.context.procesarInforme({...e.data,funcion:'Función manipulada',funcionHtml:'<b>Otro contrato</b>'});
    assert.equal(e.rows[1][11],'Administración municipal');
    const privado=[...e.docs.values()][0][0].value;
    assert.match(privado,/Administración municipal/);
    assert.doesNotMatch(privado,/Función manipulada|Otro contrato/);
});

test('una función vacía en nómina bloquea generación aunque el navegador invente una', () => {
    const e=entorno();
    e.context.obtenerMetadataSegura_=()=>({encontrado:true,nombre:'Ficticio',funcion:''});
    assert.throws(()=>e.context.procesarInforme(e.data),/vacía en la nómina/);
    assert.equal(e.creates,0); assert.equal(e.calls,0);
});

test('alerta de función usa datos de nómina y destino fijo; dos envíos comparten una alerta', () => {
    const e=entorno();
    const datos={rut:e.data.rut,mes:e.data.mesSeleccionado,anio:e.data.anio,motivo:'INCORRECTA',detalle:'Debe revisarse',
        nombre:'NOMBRE ALTERADO',to:'otro@example.test',correo:e.data.correo,fono:e.data.fono};
    assert.equal(e.context.reportarFuncionContrato(datos).exito,true);
    assert.equal(e.context.reportarFuncionContrato(datos).repetida,true);
    assert.equal(e.context.correos.length,1);
    assert.equal(e.context.correos[0].to,'renato.alvarez@municoquimbo.cl');
    assert.match(e.context.correos[0].body,/Funcionario de Prueba|Administración municipal/);
    assert.doesNotMatch(e.context.correos[0].body,/NOMBRE ALTERADO/);
});

test('una alerta rechazada por cuota no se confirma y un envío ambiguo no se repite', () => {
    const e=entorno(),d={rut:e.data.rut,mes:e.data.mesSeleccionado,anio:e.data.anio,motivo:'VACIA'};
    e.context.MailApp.getRemainingDailyQuota=()=>0;
    assert.throws(()=>e.context.reportarFuncionContrato(d),/cuota/);
    e.context.MailApp.getRemainingDailyQuota=()=>10;
    e.context.MailApp.sendEmail=()=>{throw new Error('Network timeout');};
    assert.throws(()=>e.context.reportarFuncionContrato(d),/timeout/);
    assert.throws(()=>e.context.reportarFuncionContrato(d),/envío no confirmado/);
    e.context.obtenerMetadataSegura_=()=>({encontrado:false});
    assert.throws(()=>e.context.reportarFuncionContrato(d),/dotación vigente/);
});

test('formato de actividades rechaza imágenes, discrepancias y conserva solo atributos permitidos', () => {
    const e=entorno(),c=e.context;
    const delta=JSON.stringify({ops:[{insert:'Texto',attributes:{bold:true,color:'#ff0000',link:'javascript:alert(1)'}},{insert:'\n',attributes:{list:'bullet',align:'center'}}]});
    const limpio=c.validarFormatoActividades_(delta,'Texto');
    assert.equal(limpio.ops[0].attributes.bold,true);
    assert.equal(limpio.ops[0].attributes.link,undefined);
    assert.equal(c.lineasFormatoActividades_(limpio)[0].atributos.list,'bullet');
    assert.throws(()=>c.validarFormatoActividades_(delta,'Otro texto'),/no corresponde/);
    assert.throws(()=>c.validarFormatoActividades_(JSON.stringify({ops:[{insert:{image:'url'}}]}),'Texto'),/solo admiten texto/);
});

test('el índice de dotación se comparte entre funcionarios y se reconstruye tras ordenar la hoja', () => {
    const filas=[['RUT','NOMBRE'],['12345671-5','UNO'],['12345672-5','DOS'],['12345673-5','TRES']];
    const cache={}, consumo={rangos:0};
    const sheet={getSheetId:()=>1,getLastRow:()=>filas.length,getLastColumn:()=>2,
        getRange:(r,c,nr,nc)=>({getDisplayValues:()=>{consumo.rangos++;return filas.slice(r-1,r-1+nr).map(row=>row.slice(c-1,c-1+nc));},
            getValues:()=>{consumo.rangos++;return filas.slice(r-1,r-1+nr).map(row=>row.slice(c-1,c-1+nc));}})};
    const ctx=vm.createContext({Date,Utilities:{newBlob:text=>({getBytes:()=>Buffer.from(text)})},
        CacheService:{getScriptCache:()=>({get:k=>cache[k],put:(k,v)=>cache[k]=v,remove:k=>delete cache[k]})}});
    for(const f of ['Utils.js','Dotacion.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
    assert.equal(ctx.leerFilaDotacion_(sheet,'12345671-5')[1][1],'UNO');
    const antes=consumo.rangos;
    assert.equal(ctx.leerFilaDotacion_(sheet,'12345672-5')[1][1],'DOS');
    assert.equal(consumo.rangos-antes,1);
    [filas[1],filas[3]]=[filas[3],filas[1]];
    assert.equal(ctx.leerFilaDotacion_(sheet,'12345673-5')[1][1],'TRES');
});

test('la nómina reconoce cuerpo sin DV y formatos completos, sin elegir una identidad ambigua', () => {
    const filas=[['RUT','NOMBRE'],[21816027,'FUNCIONARIO']];
    const cache={};
    const sheet={getSheetId:()=>2,getLastRow:()=>filas.length,getLastColumn:()=>2,
        getRange:(r,c,nr,nc)=>({getDisplayValues:()=>filas.slice(r-1,r-1+nr).map(row=>row.slice(c-1,c-1+nc).map(String)),
            getValues:()=>filas.slice(r-1,r-1+nr).map(row=>row.slice(c-1,c-1+nc))})};
    const ctx=vm.createContext({Date,Utilities:{newBlob:text=>({getBytes:()=>Buffer.from(text)})},
        CacheService:{getScriptCache:()=>({get:k=>cache[k],put:(k,v)=>cache[k]=v,remove:k=>delete cache[k]})}});
    for(const f of ['Utils.js','Dotacion.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
    assert.equal(ctx.leerFilaDotacion_(sheet,'21.816.027-1')[1][1],'FUNCIONARIO');
    for(const rut of ['21816027-1','218160271','21.816.027-1']) assert.ok(ctx.variantesRutNomina_(rut).includes('21816027-1'));
    assert.ok(ctx.variantesRutNomina_('12345678').includes('12345678-5'));
    filas.push(['21816027-1','DUPLICADO']);
    for(const key of Object.keys(cache)) delete cache[key];
    assert.throws(()=>ctx.leerFilaDotacion_(sheet,'21816027-1'),/más de una fila/);
});

test('todos los scripts del servidor y navegador tienen sintaxis válida', () => {
    for (const f of fs.readdirSync(root).filter(f => /\.(js|html)$/.test(f))) {
        const source = fs.readFileSync(path.join(root, f), 'utf8');
        if (f.endsWith('.js')) new vm.Script(source, { filename: f });
        else for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
            new vm.Script(match[1], { filename: f });
        }
    }
});

test('nueve solicitudes reciben tres reservas y seis respuestas de espera', () => {
    const e = entorno(); let admitidas = 0, ocupadas = 0;
    for (let i = 0; i < 9; i++) {
        try { e.context.reservarOperacion_({ ...e.data, rut: String(12345670 + i) + '-0' }, 'generacion'); admitidas++; }
        catch (error) { assert.match(error.message, /OCUPADO:/); ocupadas++; }
    }
    assert.equal(admitidas, 3); assert.equal(ocupadas, 6); assert.equal(e.rows.length, 4);
});

test('con cupos llenos rechaza antes de consultar dotación o decodificar adjuntos', () => {
    const e = entorno();
    for (let i=0;i<3;i++) e.context.reservarOperacion_({...e.data,rut:`1234567${i}-5`}, 'generacion');
    e.context.obtenerMetadataSegura_ = () => { throw new Error('No debe consultar dotación'); };
    assert.throws(() => e.context.procesarInforme(e.data), /OCUPADO/);
    for (let i=0;i<4;i++) e.context.reservarOperacion_({...e.data,rut:`2234567${i}-5`}, 'subida');
    e.context.validarAdjunto_ = () => { throw new Error('No debe decodificar el archivo'); };
    assert.throws(() => e.context.guardarArchivoFirmado({}), /OCUPADO/);
    assert.equal(e.calls,0);
    assert.equal(e.creates,0);
});

test('RUT con puntos y cero inicial comparte reserva mensual', () => {
    const e = entorno(); e.context.reservarOperacion_(e.data, 'generacion');
    assert.throws(() => e.context.reservarOperacion_({ ...e.data, rut: '9222054-0' }, 'generacion'), /EN_PROCESO:/);
    assert.equal(e.rows.length, 2);
});

test('el registro actualiza una sola fila y conserva los campos previos', () => {
    const e = entorno(); e.context.registrarEnLog_({ rut: e.data.rut, mes: e.data.mesSeleccionado, anio: e.data.anio, estado: 'GENERADO', actividades: '=IMPORTXML("x")', direccion: 'Dirección' });
    e.context.registrarEnLog_({ rut: '9222054-0', mes: e.data.mesSeleccionado, anio: e.data.anio, estado: 'FINALIZADO (OK)', linkRespaldo: 'https://drive.google.com/file/d/1/view' });
    assert.equal(e.rows.length, 2); assert.equal(e.rows[1][10][0], "'"); assert.equal(e.rows[1][21], 'Dirección');
});

test('generación repetida reutiliza PDFs sin llamadas Cloud ni nuevos documentos', () => {
    const e = entorno(); const a = e.context.procesarInforme(e.data); const b = e.context.procesarInforme(e.data);
    assert.equal(a.urlRemu, b.urlRemu); assert.equal(b.recuperado, true); assert.equal(e.calls, 1); assert.equal(e.creates, 4); assert.equal(e.rows.length, 2);
});

test('masivo e individual comparten el mismo resultado Cloud base64', () => {
    const e = entorno(); const a = e.context.procesarItemIndividualLote(e.data); const b = e.context.procesarInforme(e.data);
    assert.equal(a.links.remu, b.urlRemu); assert.equal(a.links.transp, b.urlTransp); assert.equal(e.calls, 1);
});

test('respuesta con URLs no vuelve a subir los PDF', () => {
    const e = entorno(); e.context.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ exito: true, urlRemu: 'https://drive.google.com/file/d/R/view', urlTransp: 'https://drive.google.com/file/d/T/view' }) });
    e.context.procesarInforme(e.data); assert.equal(e.creates, 2);
});

test('otra solicitud durante el HTTP no consigue duplicar el mismo periodo', () => {
    const e = entorno(); const fetch = e.context.UrlFetchApp.fetch;
    e.context.UrlFetchApp.fetch = () => { assert.throws(() => e.context.procesarInforme(e.data), /EN_PROCESO:/); return fetch(); };
    e.context.procesarInforme(e.data); assert.equal(e.calls, 1); assert.equal(e.creates, 4);
});

test('un timeout Cloud conserva documentos y evita repetir ciegamente el HTTP', () => {
    const e = entorno(); let calls = 0;
    e.context.UrlFetchApp.fetch = () => { calls++; throw new Error('timeout'); };
    assert.throws(() => e.context.procesarInforme(e.data), /timeout/);
    assert.throws(() => e.context.procesarInforme(e.data), /RECUPERACION_CLOUD:/);
    assert.equal(calls, 1); assert.equal(e.creates, 2); assert.equal(e.rows.length, 2);
});

test('faltan credenciales: no crea archivos y puede continuar después de configurarlas', () => {
    const e = entorno(); delete e.properties.CLOUD_RUN_API_KEY;
    assert.throws(() => e.context.procesarInforme(e.data), /CONFIGURACION:/); assert.equal(e.creates, 0);
    e.properties.CLOUD_RUN_API_KEY = 'test'; assert.equal(e.context.procesarInforme(e.data).exito, true);
});

test('la copia pública sustituye datos personales y salud en cuerpo, encabezado y pie', () => {
    const e = entorno(); e.context.procesarInforme({ ...e.data, actividades: 'Prueba RUT 9.222.054-0 y correo prueba@example.test.' });
    const publico = [...e.files.values()].find(f => f.name?.endsWith('_TRANSPARENCIA'));
    for (const body of e.docs.get(publico.id)) {
        assert.doesNotMatch(body.value, /9222054|9\.222\.054|example\.test|1990|Motivo de salud/);
        assert.match(body.value, /DATOS RESERVADOS/);
    }
});

test('archivos grandes, MIME falsos y meses inválidos se rechazan en el servidor', () => {
    const e = entorno(); const c = e.context;
    assert.throws(() => c.validarAdjunto_('QQ==', 'text/html'), /PDF, JPG o PNG/);
    assert.throws(() => c.validarAdjunto_(Buffer.from('not a pdf').toString('base64'), 'application/pdf'), /no coincide/);
    assert.throws(() => c.validarAdjunto_('A'.repeat(6990511), 'application/pdf'), /5 MB/);
    assert.throws(() => c.resolverPeriodo_('MES FALSO'), /mes válido/);
    assert.equal(c.obtenerRangoFechas_('FEBRERO', 2028).fin, '29/02/2028');
    assert.throws(() => c.validarFechaPeriodo_('31/02/2026', { mes: 'FEBRERO', anio: 2026 }), /fechas/);
    assert.equal(c.urlDriveValida_("https://drive.google.com/file/d/x');alert(1)//"), false);
    assert.equal(c.urlDriveValida_('https://drive.google.com.evil.test/x'), false);
});

test('finalizar dos veces guarda un único adjunto y conserva actividades', () => {
    const e = entorno(); e.context.procesarInforme(e.data);
    const payload = { rut: e.data.rut, nombre: e.data.nombre, mes: e.data.mesSeleccionado, anio: e.data.anio, bytes: Buffer.from('%PDF-1.7\nfirmado').toString('base64'), mimeType: 'application/pdf' };
    assert.equal(e.context.guardarArchivoFirmado(payload).exito, true);
    assert.equal(e.context.guardarArchivoFirmado(payload).recuperado, true);
    assert.equal(e.creates, 5); assert.equal(e.rows[1][10], e.data.actividades); assert.match(e.rows[1][5], /FINALIZADO/);
    assert.equal(e.context.procesarInforme(e.data).bloqueoTotal, true);
});

test('las cargas duales parciales no cierran el mes hasta tener ambos archivos', () => {
    const e = entorno(); const p = { rut: e.data.rut, nombre: e.data.nombre, mes: e.data.mesSeleccionado, anio: e.data.anio, bytes: Buffer.from('%PDF-1.7\nfirmado').toString('base64'), mimeType: 'application/pdf' };
    e.context.guardarArchivoDualLote({ ...p, tipo: 'transp' }); assert.equal(e.rows[1][5], 'PROCESO DUAL');
    e.context.guardarArchivoDualLote({ ...p, tipo: 'remu' }); assert.equal(e.rows[1][5], 'FINALIZADO (OK)');
    assert.equal(e.creates, 2);
});

test('un lote inicializado repetidamente no crea filas duplicadas', () => {
    const e = entorno(); e.context.inicializarLoteEnSheet([e.data, { ...e.data, rut: '9222054-0' }]);
    e.context.inicializarLoteEnSheet([e.data]); assert.equal(e.rows.length, 0);
    e.context.procesarItemIndividualLote(e.data); e.context.procesarItemIndividualLote(e.data);
    assert.equal(e.rows.length, 2);
});

test('fallo después de subir un PDF: recupera los IDs sin repetir Cloud ni crear duplicados', () => {
    const e = entorno(); const crear = e.context.Drive.Files.create; let llamadas = 0;
    e.context.Drive.Files.create = (...args) => { llamadas++; if (llamadas === 2) throw new Error('503 temporal'); return crear(...args); };
    assert.throws(() => e.context.procesarInforme(e.data), /503/);
    e.context.Drive.Files.create = crear;
    assert.equal(e.context.procesarInforme(e.data).exito, true);
    assert.equal(e.calls, 1); assert.equal(e.creates, 4); assert.equal(e.rows.length, 2);
});

test('RUT ausente en nómina no agrega filas ni crea archivos', () => {
    const e = entorno(); e.context.obtenerMetadataSegura_ = () => ({ encontrado: false });
    assert.throws(() => e.context.procesarInforme(e.data), /dotación vigente/);
    assert.equal(e.rows.length, 0); assert.equal(e.creates, 0);
});

test('soporte confirma dos PDFs ya existentes después de una respuesta perdida', () => {
    const e = entorno(); e.context.UrlFetchApp.fetch = () => { throw new Error('timeout'); };
    assert.throws(() => e.context.procesarInforme(e.data), /timeout/);
    e.files.set('R', { id: 'R', mimeType: 'application/pdf', parents: ['generados'] });
    e.files.set('T', { id: 'T', mimeType: 'application/pdf', parents: ['transp'] });
    assert.equal(e.context.confirmarArchivosCloud_(e.data.rut, e.data.mesSeleccionado, e.data.anio,
        'https://drive.google.com/file/d/R/view', 'https://drive.google.com/file/d/T/view').exito, true);
    assert.equal(e.context.procesarInforme(e.data).recuperado, true);
    assert.equal(e.creates, 2); assert.match(e.rows[1][5], /GENERADO/);
});

test('soporte no confirma un archivo ajeno a la carpeta de la operación', () => {
    const e = entorno(); e.context.UrlFetchApp.fetch = () => { throw new Error('timeout'); };
    assert.throws(() => e.context.procesarInforme(e.data), /timeout/);
    e.files.set('R', { id: 'R', mimeType: 'application/pdf', parents: ['otra-carpeta'] });
    e.files.set('T', { id: 'T', mimeType: 'application/pdf', parents: ['transp'] });
    assert.throws(() => e.context.confirmarArchivosCloud_(e.data.rut, e.data.mesSeleccionado, e.data.anio,
        'https://drive.google.com/file/d/R/view', 'https://drive.google.com/file/d/T/view'), /carpetas reservadas/);
});

test('solicitarReinicioCorreo abre ventana de Gmail con campos del funcionario', () => {
    let urlAbierta = null;
    const context = vm.createContext({
        console,
        window: {
            open: (u) => { urlAbierta = u; }
        },
        document: {
            getElementById: () => null,
            addEventListener: () => {}
        },
        encodeURIComponent: encodeURIComponent,
        decodeURIComponent: decodeURIComponent,
        escaparHtml: (s) => s
    });
    const source = fs.readFileSync(path.join(root, 'JS_INFORMES.html'), 'utf8');
    for (const m of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], context);
    context.solicitarReinicioCorreo({
        rut: '12.345.678-9',
        nombre: 'JUAN PEREZ',
        direccion: 'DIRECCIÓN DE TRÁNSITO',
        periodo: { mes: 'MAYO', anio: 2026 }
    });
    assert.match(urlAbierta, /^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=renato\.alvarez%40municoquimbo\.cl/);
    assert.match(urlAbierta, /JUAN%20PEREZ/);
    assert.match(urlAbierta, /12\.345\.678-9/);
});

test('verificarExistenciaRapida_ no vuelve a abrir la planilla si se le entrega la instancia ss', () => {
    const e = entorno();
    let openCount = 0;
    const originalOpen = e.context.SpreadsheetApp.openById;
    const mockSS = originalOpen();
    e.context.SpreadsheetApp.openById = () => { openCount++; return mockSS; };
    e.context.verificarExistenciaRapida_('12345678-5', 'MAYO', 2026, mockSS);
    assert.equal(openCount, 0, 'No debió llamar a SpreadsheetApp.openById porque se pasó mockSS');
});


