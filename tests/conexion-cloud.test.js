const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function entorno(http=400){
 const props={},logs=[],config={version:'conexion-cloud-20261014-v1',expira:Date.now()+60000,url:'https://prueba.run.app/generarPDF',apiKey:'clave-ficticia-solo-prueba'};
 let lecturas=0,requests=0,trashed=false;
 const c=vm.createContext({CONFIG:{CLOUD_CONFIG_FILE:'archivo-privado'},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperties:v=>Object.assign(props,v)})},
  DriveApp:{getFileById:()=>{lecturas++;return {getBlob:()=>({getDataAsString:()=>JSON.stringify(config)}),setTrashed:()=>trashed=true};}},
  UrlFetchApp:{fetch:(url,options)=>{requests++;assert.equal(options.payload,'{}');assert.equal(options.headers['x-api-key'],config.apiKey);return {getResponseCode:()=>http};}},
  console:{info:x=>logs.push(x),warn:x=>logs.push(x)}});
 vm.runInContext(fs.readFileSync('ConexionCloud.js','utf8'),c);
 return {c,props,logs,config,get lecturas(){return lecturas;},get requests(){return requests;},get trashed(){return trashed;}};
}
test('la sincronización comprueba la autenticación antes de guardar, retira el transporte y no muestra la clave',()=>{
 const e=entorno();e.c.asegurarConexionCloud_();e.c.asegurarConexionCloud_();
 assert.equal(e.props.CLOUD_RUN_API_KEY,e.config.apiKey);assert.equal(e.props.CLOUD_PDF_MOTOR,'HTML');assert.equal(e.lecturas,1);assert.equal(e.requests,1);assert(e.trashed);
 assert(!e.logs.join('').includes(e.config.apiKey));
});
test('una configuración rechazada o vencida no modifica credenciales ni se confirma',()=>{
 for(const modo of ['401','vencida']){const e=entorno(modo==='401'?401:400);if(modo==='vencida')e.config.expira=0;
  assert.throws(()=>e.c.asegurarConexionCloud_(),error=>error.cloudSinEjecucion===true);assert.equal(e.props.CLOUD_RUN_API_KEY,undefined);assert(!e.trashed);}
});
