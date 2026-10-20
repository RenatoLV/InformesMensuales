// Transporte privado de configuración: credencial de Cloud -> archivo Drive privado del publicador.
// No escribe ni muestra la clave en el repositorio, consola ni argumentos del proceso.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
async function main(){
 const servicio=JSON.parse(fs.readFileSync(0,'utf8'));
 const apiKey=servicio.spec.template.spec.containers[0].env.find(e=>e.name==='API_KEY')?.value;
 const url=servicio.status.url+'/generarPDF';
 if(!apiKey || !/^https:\/\/[a-z0-9.-]+\.run\.app\/generarPDF$/.test(url))throw new Error('Configuración Cloud no válida');
 const cred=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.clasprc.json'),'utf8')).tokens.default;
 let token=cred.access_token;
 if(!token || cred.expiry_date<Date.now()+60000){
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:cred.client_id,client_secret:cred.client_secret,refresh_token:cred.refresh_token})});
  const d=await r.json();if(!r.ok || !d.access_token)throw new Error('Se requiere renovar la sesión de clasp');token=d.access_token;
 }
 const headers={Authorization:'Bearer '+token};
 const about=await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',{headers}).then(r=>r.json());
 if(about.user?.emailAddress!=='renato.alvarez@municoquimbo.cl')throw new Error('La cuenta no corresponde al publicador del script');
 const boundary='config_'+crypto.randomUUID();
 const config={apiKey,url,expira:Date.now()+7200000,version:'conexion-cloud-20261014-v1'};
 const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name:'Configuración temporal privada del generador PDF',mimeType:'application/json'})+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(config)+'\r\n--'+boundary+'--';
 const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,owners(emailAddress)',{method:'POST',headers:{...headers,'content-type':'multipart/related; boundary='+boundary},body});
 const file=await r.json();if(!r.ok || !file.id)throw new Error('No se pudo crear el transporte privado de configuración');
 const permisos=await fetch('https://www.googleapis.com/drive/v3/files/'+file.id+'/permissions?fields=permissions(type,role,emailAddress)',{headers}).then(r=>r.json());
 if(!permisos.permissions?.length || permisos.permissions.some(p=>p.type!=='user'||p.role!=='owner'||p.emailAddress!==about.user.emailAddress))throw new Error('El transporte no tiene permisos exclusivamente privados');
 const informe={fileId:file.id,version:config.version,propietario:about.user.emailAddress,permisos:'Solo propietario',expira:new Date(config.expira).toISOString()};
 const salida=path.resolve(__dirname,'../output/configuracion-cloud-temporal.json');fs.mkdirSync(path.dirname(salida),{recursive:true});fs.writeFileSync(salida,JSON.stringify(informe,null,2));
 console.log(JSON.stringify(informe));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
