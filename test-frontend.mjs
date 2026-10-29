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

const estimateSource = source.slice(source.indexOf('function remainingEstimate('), source.indexOf('function renderSummary('));
const durationSource = source.slice(source.indexOf('function duration('), source.indexOf('\n', source.indexOf('function duration(')));
const remainingEstimate = runInNewContext(`${durationSource}\n${estimateSource}\nremainingEstimate`);

test('odhad zbývajícího času odečte čas běžící fáze a neopakuje uplynulý čas', () => {
  // 2 fáze dokončeny za 4 minuty, třetí běží 1 minutu: zbývá 2 × 2 min − 1 min = 3 min
  const job = {status:'running', started:0, events:[{type:'completed', time:120e3}, {type:'completed', time:240e3}]};
  assert.equal(remainingEstimate(job, 2, 300e3), '≈ 3:00');
  assert.equal(remainingEstimate(job, 2, 900e3), 'brzy');
  assert.equal(remainingEstimate({...job, events:[]}, 0, 300e3), '—');
  assert.equal(remainingEstimate({...job, status:'done'}, 2, 300e3), '—');
});

const markdown = runInNewContext(`${source.slice(source.indexOf('const escape ='), source.indexOf('const showForm ='))}\nmarkdown`);
const chartBlock = spec => '```chart\n' + JSON.stringify(spec) + '\n```';

test('blok chart vykreslí sloupcový, čárový i koláčový graf s tabulkou dat', () => {
  const series = [{name:'Tržby', values:[10, 20, 30]}];
  for (const type of ['bar', 'line', 'pie']) {
    const html = markdown(chartBlock({type, title:'Vývoj', labels:['2022', '2023', '2024'], series, unit:'mil. Kč', source:'https://example.com'}));
    assert.match(html, /<figure class="chart"><figcaption>Vývoj<\/figcaption><svg/);
    assert.match(html, /<details class="chart-data">/);
    assert.match(html, /href="https:\/\/example.com"/);
  }
  assert.match(markdown(chartBlock({type:'bar', labels:['A'], series})), /<rect/);
  assert.match(markdown(chartBlock({type:'line', labels:['A', 'B'], series:[{name:'X', values:[1, 2]}]})), /<polyline/);
  assert.match(markdown(chartBlock({type:'pie', labels:['A', 'B'], series:[{name:'X', values:[1, 3]}]})), /25 %/);
});

test('neplatný graf zůstane blokem kódu a texty se escapují', () => {
  assert.match(markdown('```chart\n{neplatný json\n```'), /<pre class="code-block">/);
  assert.match(markdown(chartBlock({type:'pie', labels:['A'], series:[{name:'X', values:[-1]}]})), /<pre class="code-block">/);
  assert.match(markdown(chartBlock({type:'bar', labels:['A', 'B'], series:[{name:'X', values:[1]}]})), /<pre class="code-block">/);
  const html = markdown(chartBlock({type:'bar', title:'<img src=x onerror=alert(1)>', labels:['<script>'], series:[{name:'"x"', values:[1]}]}));
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;script&gt;/);
});
