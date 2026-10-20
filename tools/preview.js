// Vista local con datos ficticios. No conecta con Apps Script, Cloud ni Drive.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mock = `<script>
const previewData = { encontrado: true, rut: '12.345.678-5', nombre: 'Funcionario de Demostración', programa: 'HONORARIOS', funcion: 'Apoyo a la gestión y atención municipal', direccion: 'Dirección de Desarrollo Comunitario', nacimiento: '01/01/1990', email: 'demo@example.test', fono: '912345678', sesionPendiente: false, sesionFinalizada: false };
window.google = { script: { run: new Proxy({}, { get(_, key) {
  let success = () => {}, failure = () => {};
  const chain = new Proxy({}, { get(_, fn) {
    if (fn === 'withSuccessHandler') return cb => { success = cb; return chain; };
    if (fn === 'withFailureHandler') return cb => { failure = cb; return chain; };
    return (...args) => setTimeout(() => {
      document.documentElement.dataset.previewRpcCalls = String(Number(document.documentElement.dataset.previewRpcCalls || 0) + 1);
      if (fn === 'buscarFuncionario') success(previewData);
      else if (fn === 'obtenerListaNombresJefaturas') success(['JEFATURA DE DEMOSTRACIÓN']);
      else if (fn === 'buscarInfoJefaturaPorNombre') success({ nombre: 'JEFATURA DE DEMOSTRACIÓN', cargo: 'Director', direccion: previewData.direccion });
      else if (fn === 'procesarInforme') success({exito:true,urlRemu:'https://drive.google.com/file/d/demo-remuneraciones/view',urlTransp:'https://drive.google.com/file/d/demo-transparencia/view'});
      else failure(new Error('Vista previa: esta acción requiere Apps Script.'));
    }, fn === 'procesarInforme' ? 6000 : 350);
  }});
  return chain[key];
}}) }};
</script>`;
const mockRecepcion = `<script>
const personasDemo=[{rut:'12345678-5',nombre:'MARÍA JOSÉ PÉREZ SOTO'},{rut:'09222054-0',nombre:'JUAN PABLO GONZÁLEZ ROJAS'},{rut:'21816027-1',nombre:'ANA ISABEL MUÑOZ DÍAZ'}];
const entregasDemo={};
window.google={script:{run:new Proxy({},{get(_,key){
 let success=()=>{},failure=()=>{};
 const chain=new Proxy({},{get(_,fn){
  if(fn==='withSuccessHandler')return cb=>{success=cb;return chain;};
  if(fn==='withFailureHandler')return cb=>{failure=cb;return chain;};
  return (...args)=>setTimeout(()=>{
   if(fn==='obtenerCatalogoRecepcionMasiva')return success({email:'demo@example.test',nomina:'NÓMINA FICTICIA',personas:personasDemo,anio:2026,mes:10});
   if(fn==='listarCarpetaRecepcionMasiva'){
    const transp=String(args[0]).includes('transp');
    const nombres=transp?['MARIA JOSE PEREZ SOTO.pdf','JUAN PABLO GONZALEZ ROJAS.pdf']:['MARÍA JOSÉ PÉREZ SOTO.pdf','JUAN PABLO GONZÁLEZ ROJAS.pdf','ANA ISABEL MUÑOZ DÍAZ.pdf'];
    return success({archivos:nombres.map((name,i)=>({id:'demo-'+(transp?'transp':'remu')+'-'+i,name,size:1024*140,version:'1',mimeType:'application/pdf'})),siguiente:''});
   }
   if(fn==='consultarEstadoRecepcionMasiva')return success(entregasDemo);
   if(fn==='registrarParRecepcionMasiva'){
    const d=args[0],result={exito:true,rut:d.rut,loteId:d.loteId,remu:'https://drive.google.com/file/d/demo-remu/view',transp:'https://drive.google.com/file/d/demo-transp/view'};
    entregasDemo[d.rut]={...result,estado:'FINALIZADO (DEMO)',finalizado:true};return success(result);
   }
   failure(new Error('Acción no disponible en demostración.'));
  },fn==='registrarParRecepcionMasiva'?600:100);
 }});return chain[key];
}})}};
</script>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url,'http://localhost');
  const recepcion = url.pathname === '/recepcion';
  if (url.pathname !== '/' && url.pathname !== '/index.html' && !recepcion) { res.writeHead(404); return res.end(); }
  let html = fs.readFileSync(path.join(root, recepcion ? 'RecepcionMasiva.html' : 'Index.html'), 'utf8').replace(/<\?!= include\('([^']+)'\); \?>/g, (_, name) => fs.readFileSync(path.join(root, name + '.html'), 'utf8'));
  html = html.replace('<head>', '<head>' + (recepcion ? mockRecepcion : mock));
  if(recepcion) html=html.replace('<main>','<main><p class="notice">DEMOSTRACIÓN LOCAL · Datos ficticios. No guarda en Drive ni Sheets. Para probar carpetas use demo-remu o demo-transp.</p>');
  if (url.searchParams.get('vista') === 'generacion') html=html.replace('</body>', `<button type="button" id="preview-generacion" style="position:fixed;bottom:16px;right:16px;z-index:1000" onclick="llenarFormulario(previewData);activarVistaLogeado(previewData);generarIndividual()">Probar generación ficticia</button></body>`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
});
server.listen(Number(process.env.PREVIEW_PORT || 8765), '127.0.0.1', () => console.log('Vista previa local disponible.'));
