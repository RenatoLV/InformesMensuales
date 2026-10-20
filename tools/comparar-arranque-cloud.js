const {spawnSync}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs');
const cwd=path.resolve(__dirname,'../cloud-run/optimizado');
const resultados=[];
for(let intento=0;intento<3;intento++)for(const modo of ['completo','selectivo']){
 const carga=modo==='completo'?"require('googleapis')":"['drive','firestore','storage','cloudtasks'].forEach(api=>require('googleapis/build/src/apis/'+api))";
 const codigo="const inicio=performance.now();"+carga+";console.log(JSON.stringify({ms:Math.round(performance.now()-inicio),rssMiB:Math.round(process.memoryUsage().rss/1048576)}));";
 const r=spawnSync(process.execPath,['-e',codigo],{cwd,encoding:'utf8',timeout:60000});
 if(r.status!==0)throw new Error(r.stderr || 'Falló el subproceso');
 resultados.push({modo,intento,...JSON.parse(r.stdout)});
}
const salida=path.resolve(__dirname,'../output/optimizacion-cloud');fs.mkdirSync(salida,{recursive:true});
fs.writeFileSync(path.join(salida,'arranque.json'),JSON.stringify(resultados,null,2));
console.log(JSON.stringify(resultados,null,2));
