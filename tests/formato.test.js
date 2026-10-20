const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

test('el documento conserva títulos, listas y estilos y no vuelve a procesar marcadores escritos por el usuario',()=>{
    const nombres=['FONT_FAMILY','FONT_SIZE','BOLD','ITALIC','UNDERLINE','STRIKETHROUGH','FOREGROUND_COLOR','BACKGROUND_COLOR'];
    const ctx=vm.createContext({DocumentApp:{Attribute:Object.fromEntries(nombres.map(k=>[k,k])),
        HorizontalAlignment:{LEFT:'LEFT',CENTER:'CENTER',RIGHT:'RIGHT',JUSTIFY:'JUSTIFY'}}});
    for(const f of ['Utils.js','FormatoActividades.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx);
    const body={children:[],getParent:()=>null,getChildIndex:p=>body.children.indexOf(p),
        insertParagraph(i,txt){const p=paragraph(txt);body.children.splice(i,0,p);return p;},
        findText(pattern,prev){
            const start=prev?body.children.indexOf(prev.paragraph)+1:0;
            const p=body.children.slice(start).find(p=>new RegExp(pattern).test(p.text));
            return p?{paragraph:p,getElement:()=>({getParent:()=>p})}:null;
        }};
    function paragraph(text){return {text,styles:[],getParent:()=>body,getText(){return this.text;},
        appendText(s){this.text+=s;},editAsText(){return {setAttributes:(s,e,a)=>this.styles.push({start:s,end:e,attrs:a})};},
        setAlignment(v){this.align=v;},setIndentStart(v){this.indent=v;},setIndentFirstLine(){},setSpacingAfter(){},
        removeFromParent(){body.children.splice(body.children.indexOf(this),1);}};}
    body.children.push(paragraph('Inicio: {{informe_glosa}} :fin'),paragraph('{{informe_glosa}}'));
    const ops=[{insert:'Título'},{insert:'\n',attributes:{header:1,align:'center'}},
        {insert:'Consulta {{informe_glosa}}',attributes:{bold:true,underline:true,color:'#ff0000'}},
        {insert:'\n',attributes:{list:'bullet',indent:1}}, {insert:'Seguimiento',attributes:{italic:true}},
        {insert:'\n',attributes:{list:'ordered'}}];
    const formato=ctx.validarFormatoActividades_(JSON.stringify({ops}),ops.map(o=>o.insert).join('').trim());
    ctx.reemplazarActividadesConFormato_(body,formato);
    assert.equal(body.children.length,6);
    assert.equal(body.children[0].text,'Inicio: Título');
    assert.equal(body.children[0].align,'CENTER');
    assert.equal(body.children[0].styles[1].attrs.FONT_SIZE,18);
    assert.equal(body.children[1].text,'• Consulta {{informe_glosa}}');
    assert.equal(body.children[1].indent,18);
    assert.equal(body.children[1].styles[1].attrs.BOLD,true);
    assert.equal(body.children[1].styles[1].attrs.UNDERLINE,true);
    assert.equal(body.children[1].styles[1].attrs.FOREGROUND_COLOR,'#ff0000');
    assert.equal(body.children[2].text,'1. Seguimiento :fin');
    assert.equal(body.children[2].styles[1].attrs.ITALIC,true);
});
