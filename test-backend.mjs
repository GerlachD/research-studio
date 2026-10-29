import {test} from 'node:test';
import assert from 'node:assert/strict';
import {run} from './server.mjs';

const newJob = () => ({input:{topic:'Testovací téma',goal:'',audience:'',scope:'',attachments:''},steps:Object.fromEntries(['gateway','research','analyst','writer'].map(name=>[name,{status:'waiting'}]))});

test('spotřeba neúspěšné odpovědi zůstává u fáze', async()=>{
  const job=newJob();
  await run(job,async(_messages,search)=>({model:'test-model',usage:{cost:0.031, prompt_tokens:200},choices:[{message:{content:'odpověď'}}]}));
  assert.equal(job.status,'failed');
  assert.equal(job.current,'research');
  assert.equal(job.steps.research.model,'test-model');
  assert.equal(job.steps.research.usage.cost,0.031);
  assert.equal(job.steps.analyst.status,'waiting');
});

test('selhání ukládání zastaví běh bez odmítnuté promise a bez volání modelu', async()=>{
  const job=newJob();let calls=0;
  await assert.doesNotReject(run(job,async()=>{calls++;},()=>{throw Error('disk je plný');}));
  assert.equal(calls,0);
  assert.equal(job.status,'failed');
  assert.match(job.error,/Nepodařilo se uložit výzkum/);
});

test('selhání závěrečného ukládání neoznačí výzkum za dokončený', async()=>{
  const job=newJob();let saves=0;
  await assert.doesNotReject(run(job,async(_messages,search)=>({choices:[{message:{content:'text'}}],usage:search?{server_tool_use_details:{web_search_requests:1}}:{}}),()=>{if(++saves===9)throw Error('disk je plný');}));
  assert.equal(job.status,'failed');
  assert.match(job.error,/Nepodařilo se uložit výzkum/);
});

test('writer dostane analýzu i původní nálezy Research a URL citací', async()=>{
  const job=newJob();const calls=[];
  await run(job,async(messages,search)=>{
    calls.push(messages);
    const text=search?'Nálezy z webu':calls.length===3?'Analýza bez odkazu':'výstup';
    return {choices:[{message:{content:text,annotations:search?[{url_citation:{url:'https://example.org/zdroj'}}]:[]}}],usage:search?{server_tool_use_details:{web_search_requests:1}}:{}};
  });
  assert.equal(job.status,'done');
  assert.match(calls[3][1].content,/Analýza bez odkazu/);
  assert.match(calls[3][1].content,/Nálezy z webu/);
  assert.match(calls[3][1].content,/https:\/\/example.org\/zdroj/);
});

test('gateway dostane zadání jen jednou, další fáze výstup předchozí', async()=>{
  const calls=[]; const j={input:{topic:'Téma testu',goal:'',audience:'',scope:'',attachments:'PŘÍLOHA'},steps:Object.fromEntries(['gateway','research','analyst','writer'].map(s=>[s,{status:'waiting'}]))};
  await run(j, async(messages,search)=>{calls.push(messages[1].content);return {choices:[{message:{content:'výstup'}}],usage:search?{server_tool_use_details:{web_search_requests:1}}:{}};});
  assert.equal(calls[0].split('PŘÍLOHA').length,2); assert.doesNotMatch(calls[0],/Výstup předchozí fáze/); assert.match(calls[1],/Výstup předchozí fáze/);
});
