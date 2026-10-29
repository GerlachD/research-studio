import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./public/app.js', import.meta.url), 'utf8');
const start = source.slice(source.indexOf('function wantsStart('), source.indexOf('function mergeDraft('));
const merge = source.slice(source.indexOf('function mergeDraft('), source.indexOf('function saveBrief('));
const wantsStart = runInNewContext(`${start}\nwantsStart`);
const mergeDraft = runInNewContext(`const briefFields=['topic','goal','audience','scope'];\n${merge}\nmergeDraft`);

test('automaticky spouští jen jednoznačný samostatný pokyn', () => {
  for(const message of ['rovnou začni','Ano, spusť výzkum.','Prosím začni teď']) assert.equal(wantsStart(message),true,message);
  for(const message of ['Až to schválím, začni','Začni zítra','Nezačínej','Začni, ale zahrň Slovensko','Jestli chceš, spusť výzkum','Nechci začít']) assert.equal(wantsStart(message),false,message);
});

test('převzetí návrhu zachovává ručně upravená pole včetně úmyslného smazání', () => {
  const merged=mergeDraft({topic:'Moje téma',goal:'',audience:'',scope:'ČR'}, {topic:'Jiné téma',goal:'Nový cíl',audience:'Vedení',scope:'Evropa'},new Set(['topic','goal','scope']));
  assert.equal(merged.topic,'Moje téma');
  assert.equal(merged.goal,'');
  assert.equal(merged.scope,'ČR');
  assert.equal(merged.audience,'Vedení');
});

test('výpadek po úspěšném načtení zobrazí upozornění a obnovení jej odstraní', async () => {
  const refreshCode=source.slice(source.indexOf("let last='';"),source.lastIndexOf(' refresh();setInterval'));
  const status={hidden:true,textContent:''}, count={textContent:''}, jobs={contains:()=>false};
  let offline=false;
  const refresh=runInNewContext(`${refreshCode}\nrefresh`,{
    researchId:null,
    $:selector=>({'#connection-status':status,'#count':count,'#jobs':jobs}[selector]),
    fetch:async()=>{if(offline) throw Error('offline');return {ok:true,json:async()=>[]};},
    document:{getSelection:()=>'',activeElement:null,querySelectorAll:()=>[]},
    renderSummary:()=>''
  });
  await refresh(); assert.equal(status.hidden,true);
  offline=true; await refresh(); assert.equal(status.hidden,false); assert.match(status.textContent,/nemusí být aktuální/);
  offline=false; await refresh(); assert.equal(status.hidden,true);
});

test('opuštění rozepsaného konceptu varuje, po spuštění nikoli',()=>{
  const line=source.split('\n').find(value=>value.startsWith("window.addEventListener('beforeunload'"));
  let handler;const sandbox={window:{addEventListener:(_name,fn)=>{handler=fn;}},researchId:null,submitted:false,chatMessages:[{role:'user',content:'zadání'}],briefFields:['topic'],attachmentRequired:false,$:selector=>selector==='#chat-input'?{value:''}:selector==='#files'?{files:[]}:{elements:{topic:{value:''}}}};
  runInNewContext(line,sandbox);
  let warned=false;handler({preventDefault(){warned=true;}});assert.equal(warned,true);
  sandbox.submitted=true;warned=false;handler({preventDefault(){warned=true;}});assert.equal(warned,false);
});
