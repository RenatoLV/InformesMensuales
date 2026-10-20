const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function entorno() {
    const calls = [], timers = [];
    const run = () => {
        let ok, fail;
        const proxy = new Proxy({}, {get(_, fn) {
            if(fn === 'withSuccessHandler') return cb => {ok=cb; return proxy;};
            if(fn === 'withFailureHandler') return cb => {fail=cb; return proxy;};
            return (...args) => calls.push({fn,args,ok,fail});
        }});
        return proxy;
    };
    const context = vm.createContext({tutorialActivo:false, console:{info(){},error(){}},
        document:{getElementById(){return null;}},
        setTimeout:(cb,ms) => timers.push({cb,ms}),
        google:{script:{get run(){return run();}}}});
    const source = fs.readFileSync(path.join(__dirname,'../JS_SOLICITUDES.html'),'utf8');
    vm.runInContext(source.replace(/^<script>\s*|\s*<\/script>\s*$/g,''),context);
    return {calls,timers,ask:(fn,...args) => vm.runInContext('GestorSolicitudes',context).ejecutar(fn,args),
        writes:() => vm.runInContext('GestorSolicitudes.tieneEscrituras()',context)};
}

test('se limita a dos RPC y una escritura; las lecturas pueden continuar durante una generación',async()=>{
    const e=entorno();
    const promises=[e.ask('procesarInforme',{rut:'1',mes:'OCTUBRE'}),e.ask('procesarInforme',{rut:'2',mes:'OCTUBRE'}),e.ask('buscarFuncionario','3')];
    assert.deepEqual(e.calls.map(c=>c.fn),['procesarInforme','buscarFuncionario']);
    assert.equal(e.writes(),true);
    e.calls[1].ok({encontrado:true});
    assert.equal(e.calls.length,2);
    e.calls[0].ok({exito:true});
    assert.equal(e.calls.length,3);
    e.calls[2].ok({exito:true}); await Promise.all(promises);
    assert.equal(e.writes(),false);
});

test('coalesce consultas, copia los resultados y cachea catálogo pero no estado del informe',async()=>{
    const e=entorno();
    const a=e.ask('obtenerListaNombresJefaturas'),b=e.ask('obtenerListaNombresJefaturas');
    assert.equal(e.calls.length,1); e.calls[0].ok(['JEFE']);
    const first=await a; first.push('CAMBIO');
    assert.deepEqual(Array.from(await b),['JEFE']);
    assert.deepEqual(Array.from(await e.ask('obtenerListaNombresJefaturas')),['JEFE']);
    const c=e.ask('buscarFuncionario','123'); e.calls[1].ok({estado:'GENERADO'}); await c;
    const d=e.ask('buscarFuncionario','123'); assert.equal(e.calls.length,3);
    e.calls[2].ok({estado:'FINALIZADO'}); assert.equal((await d).estado,'FINALIZADO');
});

test('no duplica una escritura idéntica y rechaza otra versión mientras está pendiente',async()=>{
    const e=entorno(),datos={rut:'12.345.678-5',mes:'OCTUBRE',actividades:'A'};
    const a=e.ask('procesarInforme',datos),b=e.ask('procesarInforme',{...datos});
    assert.equal(e.calls.length,1);
    await assert.rejects(e.ask('procesarInforme',{...datos,actividades:'B'}),/otros datos/);
    e.calls[0].ok({exito:true}); await Promise.all([a,b]);
});

test('la espera por ocupación libera RPC; los reintentos son acotados y no repiten envíos ambiguos',async()=>{
    const e=entorno();
    const a=e.ask('procesarInforme',{rut:'1',mes:'OCTUBRE'});
    const rechazo=assert.rejects(a,/OCUPADO/);
    e.calls[0].fail(new Error('OCUPADO: cupo lleno'));
    assert.ok(e.timers[0].ms>=5000 && e.timers[0].ms<10000);
    const read=e.ask('buscarFuncionario','2'); e.calls[1].ok({}); await read;
    for(let i=0;i<7;i++){e.timers[i].cb(); e.calls.at(-1).fail(new Error('OCUPADO: cupo lleno'));}
    await rechazo; assert.equal(e.timers.length,7);
    const b=e.ask('guardarArchivoFirmado',{rut:'1',mes:'OCTUBRE',bytes:'PDF'});
    e.calls.at(-1).fail(new Error('Network timeout'));
    await assert.rejects(b,/Network timeout/); assert.equal(e.timers.length,7);
    const c=e.ask('enviarReporteProblema',{});
    e.calls.at(-1).fail(new Error('too many simultaneous executions'));
    await assert.rejects(c,/simultaneous/); assert.equal(e.timers.length,7);
});
