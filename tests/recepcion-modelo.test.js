const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync('JS_RECEPCION_MODELO.html','utf8').replace(/<\/?script>/g,''),ctx);
const M=vm.runInContext('RecepcionModelo',ctx);
const personas=[{rut:'12345678-5',nombre:'MARÍA JOSÉ PÉREZ SOTO'},{rut:'09222054-0',nombre:'JUAN PABLO GONZÁLEZ ROJAS'}];
const archivo=(tipo,name,extra={})=>({key:tipo+name,tipo,name,origen:'local',size:100,disponible:true,...extra});
test('agrupa acentos, prefijos de versión y RUT; no depende del orden de las listas',()=>{
 const rows=M.agrupar([archivo('transp','Transparencia - MARIA JOSE PEREZ SOTO.pdf'),archivo('remu','12.345.678-5.pdf'),
 archivo('remu','JUAN PABLO GONZALEZ ROJAS.pdf')],personas);
 const maria=rows.find(x=>x.rut==='12345678-5'),juan=rows.find(x=>x.rut==='09222054-0');
 assert(maria.listo); assert(!juan.listo); assert(juan.problemas.includes('Falta transparencia'));
});
test('no adjudica homónimos ni RUT inválidos; asignación manual exige identidad única',()=>{
 const p=[...personas,{rut:'21816027-1',nombre:personas[0].nombre}];
 let rows=M.agrupar([archivo('remu',personas[0].nombre+'.pdf'),archivo('transp',personas[0].nombre+'.pdf')],p);
 assert(!rows[0].listo);assert.equal(rows[0].rut,'');
 rows=M.agrupar([archivo('remu','cualquiera.pdf',{asignacion:'12345678-5'}),archivo('transp','otro.pdf',{asignacion:'12345678-5'})],p);
 assert(rows[0].listo);
 assert(M.identificar(archivo('remu','12345678-9.pdf'),personas).error);
 assert(M.identificar(archivo('remu','12345678-5.pdf'),[...personas,personas[0]]).error);
});
test('bloquea duplicados, falta de archivos locales, tamaño y un mismo PDF en ambas versiones',()=>{
 const pair=[archivo('remu','12345678-5.pdf'),archivo('transp','12345678-5.pdf')];
 assert(!M.agrupar([...pair,{...pair[0],key:'otro'}],personas)[0].listo);
 assert(!M.agrupar([{...pair[0],disponible:false},pair[1]],personas)[0].listo);
 assert(!M.agrupar([{...pair[0],size:6*1024*1024},pair[1]],personas)[0].listo);
 assert(!M.agrupar(pair.map(a=>({...a,origen:'drive',id:'same-file'})),personas)[0].listo);
 assert(!M.agrupar(pair.map(a=>({...a,md5Checksum:'same-content'})),personas)[0].listo);
});
test('CSV preserva nombres y comillas y neutraliza fórmulas de planilla',()=>{
 const out=M.csv([['nombre','observación'],['=HYPERLINK("x")','  +1'],['María; Soto','normal']]);
 assert(out.startsWith('\uFEFF'));assert(out.includes(`"'=HYPERLINK(""x"")"`));assert(out.includes(`"'  +1"`));assert(out.includes('"María; Soto"'));
});
test('3.706 archivos se agrupan sin perder funcionarios ni crear parejas cruzadas',()=>{
 const p=[],files=[];
 for(let i=0;i<1853;i++){
  const cuerpo=String(15000000+i);let n=0,f=2;
  for(let j=cuerpo.length-1;j>=0;j--){n+=Number(cuerpo[j])*f;f=f===7?2:f+1;}
  const d=11-n%11,id=cuerpo+'-'+(d===11?'0':d===10?'K':d);
  p.push({rut:id,nombre:'PERSONA '+i});
  files.push(archivo('remu',id+'.pdf'),archivo('transp','PERSONA '+i+'.pdf'));
 }
 const rows=M.agrupar(files,p);assert.equal(rows.length,1853);assert(rows.every(x=>x.listo));
});
