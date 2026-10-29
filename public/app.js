const $ = s => document.querySelector(s);
const labels = {gateway:'Gateway',research:'Research',analyst:'Super analytik',writer:'Writer'};
const descriptions = {gateway:'Připravuje výzkumný brief',research:'Hledá relevantní zdroje',analyst:'Hodnotí důkazy a souvislosti',writer:'Sestavuje závěrečnou zprávu'};
const researchBase = new URL('research/', document.baseURI).pathname;
const researchId = location.pathname.startsWith(researchBase) ? location.pathname.slice(researchBase.length) : null;
const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function markdown(text) {
  const inline = value => {
    const links = [];
    let result = escape(value).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_, label, url) => {
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
      return `\u0000${links.length - 1}\u0000`;
    });
    result = result.replace(/https?:\/\/[^\s<>"\u0000]+/gi, url => {
      const clean = url.replace(/[.,;:!?]+$/, '');
      return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${url.slice(clean.length)}`;
    }).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
    return result.replace(/\u0000(\d+)\u0000/g, (_, index) => links[Number(index)]);
  };
  const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
  const isDivider = line => line && cells(line).length > 0 && cells(line).every(cell => /^:?-{3,}:?$/.test(cell));
  const lines = text.split(/\r?\n/), output = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const code = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      output.push(`<pre class="code-block"><code>${escape(code.join('\n'))}</code></pre>`); continue;
    }
    if (line.includes('|') && isDivider(lines[i + 1])) {
      const header = cells(line), rows = []; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(cells(lines[i++]));
      const columns = Math.max(header.length, ...rows.map(row => row.length));
      const row = (values, tag) => `<tr>${Array.from({length:columns}, (_, n) => `<${tag}>${inline(values[n] || '')}</${tag}>`).join('')}</tr>`;
      output.push(`<div class="table-wrap" tabindex="0" role="region" aria-label="Tabulka výsledků"><table><thead>${row(header, 'th')}</thead><tbody>${rows.map(values => row(values, 'td')).join('')}</tbody></table></div>`); continue;
    }
    const heading = line.match(/^\s*(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (heading) { const level = heading[1].length + 1; output.push(`<h${level}>${inline(heading[2])}</h${level}>`); i++; continue; }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { output.push('<hr>'); i++; continue; }
    const list = line.match(/^\s*([-*+]\s+|\d+[.)]\s+)/);
    if (list) {
      const ordered = /^\d/.test(list[1]), tag = ordered ? 'ol' : 'ul', items = [];
      const pattern = ordered ? /^\s*\d+[.)]\s+(.+)/ : /^\s*[-*+]\s+(.+)/;
      while (i < lines.length) { const item = lines[i].match(pattern); if (!item) break; items.push(`<li>${inline(item[1])}</li>`); i++; }
      output.push(`<${tag}>${items.join('')}</${tag}>`); continue;
    }
    output.push(`<p>${inline(line)}</p>`); i++;
  }
  return output.join('');
}
const showForm = () => { $('#form-section').hidden=false; $('#form-section').scrollIntoView({behavior:'smooth'}); };
if (researchId) { $('#home-intro').hidden=true; $('#workspace-heading').hidden=true; $('#back-home').hidden=false; $('#jobs').innerHTML='<p class="hint">Načítám výzkum…</p>'; }
$('#new').onclick=showForm; if ($('#empty-new')) $('#empty-new').onclick=showForm; $('#close').onclick=()=>$('#form-section').hidden=true;
async function readAttachments() { let attachments=''; for(const file of $('#files').files){if(!/\.(txt|md|csv)$/i.test(file.name) || file.size>25000) throw Error('Použijte soubory TXT, MD nebo CSV do 25 kB.'); attachments+=`\n--- ${file.name} ---\n${await file.text()}`;} if(new TextEncoder().encode(attachments).length>25000)throw Error('Přílohy jsou příliš velké.'); return attachments; }
let chatMessages=[], draft=null, editedFields=new Set(), attachmentRequired=false, submitted=false;
const draftKey='research-studio-brief-v1', briefFields=['topic','goal','audience','scope'];
function wantsStart(text) { return /^(?:(?:ano|dobře|ok|prosím|rovnou|teď)\s*[,.:!]?\s*)*(?:začni|začněte|zahaj|zahajte|spusť|spusťte)(?:\s+(?:prosím|rovnou|teď|výzkum|rešerši|to))*[.!]?$/iu.test(text.trim()); }
function mergeDraft(current, proposed, edited) { return Object.fromEntries(briefFields.map(key=>[key,edited.has(key)?current[key]:(proposed[key] || '')])); }
function saveBrief() { try { sessionStorage.setItem(draftKey,JSON.stringify({messages:chatMessages,draft,edited:[...editedFields],fields:Object.fromEntries(briefFields.map(key=>[key,$('#form').elements[key].value])),message:$('#chat-input').value,hasAttachments:attachmentRequired || $('#files').files.length>0})); } catch { $('#chat-error').textContent='Koncept se nepodařilo uložit; po obnovení stránky může být ztracen.'; } }
function applyDraft() { const form=$('#form');const current=Object.fromEntries(briefFields.map(key=>[key,form.elements[key].value]));const merged=mergeDraft(current,draft,editedFields);for(const key of briefFields)form.elements[key].value=merged[key];saveBrief(); }
function addChatMessage(role, text) { const item=document.createElement('p'); item.className=role==='user'?'chat-user':'chat-assistant'; item.textContent=text; $('#chat-messages').append(item); item.scrollIntoView({block:'nearest'}); }
$('#chat-form').onsubmit=async e=>{e.preventDefault();const text=$('#chat-input').value.trim();if(!text)return;const button=e.target.querySelector('[type=submit]');button.disabled=true;button.textContent='Analytik odpovídá…';$('#chat-reset').disabled=true;$('#chat-error').textContent='';try{if(attachmentRequired)throw Error('Přílohy z původního zadání připojte znovu nebo je odeberte.');const attachments=await readAttachments();const messages=[...chatMessages,{role:'user',content:text}];if(messages.length>19){if(wantsStart(text)&&draft?.topic?.trim().length>=5){applyDraft();$('#form').requestSubmit();return;}throw Error('Dosáhli jste limitu 10 výměn. Zpráva zůstala v poli: další doplnění zapracujte ručně do návrhu, nebo začněte nový rozhovor.');}const res=await fetch('api/brief-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,attachments})});const result=await res.json();if(!res.ok)throw Error(result.error);chatMessages=[...messages,{role:'assistant',content:result.reply}];draft=result.draft;addChatMessage('user',text);addChatMessage('assistant',result.reply);$('#chat-input').value='';$('#apply-draft').disabled=!draft.topic || draft.topic.trim().length<5;saveBrief();if(wantsStart(text)){if($('#apply-draft').disabled)throw Error('Chybí téma výzkumu. Doplňte ho v návrhu zadání.');applyDraft();$('#form').requestSubmit();}else if(chatMessages.length>=20){addChatMessage('assistant','Dosáhli jsme 10 výměn. Převezměte návrh a spusťte výzkum, nebo napište „začni“.');}}catch(err){$('#chat-error').textContent=err.message;}finally{button.disabled=false;button.textContent='Odeslat zprávu ↑';$('#chat-reset').disabled=false;}};
$('#apply-draft').onclick=()=>{if(!draft)return;applyDraft();$('#form').elements.topic.focus();};
$('#chat-reset').onclick=()=>{chatMessages=[];draft=null;$('#apply-draft').disabled=true;$('#chat-messages').replaceChildren();addChatMessage('assistant','Jaké téma chcete prozkoumat a k jakému rozhodnutí vám má výzkum pomoci?');$('#chat-error').textContent='';saveBrief();};
$('#form').onsubmit=async e=>{e.preventDefault(); const button=e.target.querySelector('[type=submit]'); button.disabled=true; $('#error').textContent=''; try {if(attachmentRequired)throw Error('Přílohy z původního zadání připojte znovu nebo je odeberte.');const attachments=await readAttachments(); const data=Object.fromEntries(new FormData(e.target)); delete data.files; data.attachments=attachments; const res=await fetch('api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); const result=await res.json(); if(!res.ok)throw Error(result.error); try{sessionStorage.removeItem(draftKey);}catch{} submitted=true; location.assign(`research/${encodeURIComponent(result.id)}`);}catch(err){$('#error').textContent=err.message;}finally{button.disabled=false;}};
for(const key of briefFields) $('#form').elements[key].addEventListener('input',()=>{editedFields.add(key);saveBrief();});
$('#chat-input').addEventListener('input',saveBrief);
window.addEventListener('beforeunload',event=>{if(!researchId && !submitted && (chatMessages.length || $('#chat-input').value.trim() || briefFields.some(key=>$('#form').elements[key].value.trim()) || $('#files').files.length || attachmentRequired)){event.preventDefault();event.returnValue='';}});
$('#files').addEventListener('change',()=>{if($('#files').files.length){attachmentRequired=false;$('#attachment-warning').hidden=true;}saveBrief();});
$('#discard-attachments').onclick=()=>{attachmentRequired=false;$('#attachment-warning').hidden=true;$('#files').value='';saveBrief();};
if(!researchId){try{const saved=JSON.parse(sessionStorage.getItem(draftKey) || 'null');if(saved){chatMessages=Array.isArray(saved.messages)?saved.messages:[];draft=saved.draft;editedFields=new Set(Array.isArray(saved.edited)?saved.edited:[]);for(const key of briefFields) $('#form').elements[key].value=typeof saved.fields?.[key]==='string'?saved.fields[key]:'';$('#chat-input').value=typeof saved.message==='string'?saved.message:'';for(const message of chatMessages) if(['user','assistant'].includes(message.role)&&typeof message.content==='string')addChatMessage(message.role,message.content);$('#apply-draft').disabled=!draft?.topic || draft.topic.trim().length<5;attachmentRequired=!!saved.hasAttachments;$('#attachment-warning').hidden=!attachmentRequired;$('#form-section').hidden=false;}}catch{$('#chat-error').textContent='Uložený koncept se nepodařilo obnovit.';}}
function duration(ms){const s=Math.max(0,Math.floor(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
function renderSummary(job) {
  const done=Object.values(job.steps).filter(step=>step.status==='done').length;
  const states={running:'Probíhá',done:'Dokončeno',failed:'Přerušeno'};
  return `<a class="research-card" href="research/${encodeURIComponent(job.id)}"><div class="card-top"><span class="eyebrow">${new Date(job.started).toLocaleString('cs-CZ')}</span><span class="status ${job.status}">${states[job.status]}</span></div><h3>${escape(job.input.topic)}</h3><p>${job.status==='running'?`Právě pracuje ${labels[job.current]}`:job.status==='done'?'Závěrečná zpráva je připravena':'Výzkum byl přerušen'}</p><div class="card-bottom"><span>${done} / 4 fáze</span><span>Otevřít výzkum →</span></div><div class="progress-track" role="progressbar" aria-label="Dokončené fáze" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${done}"><span style="width:${done*25}%"></span></div></a>`;
}
function renderStatistics(job) {
  const values=Object.entries(job.steps).map(([key,step])=>{
    const events=(job.events || []).filter(event=>event.stage===key);
    const start=events.find(event=>event.type==='started')?.time;
    const end=events.find(event=>event.type==='completed'||event.type==='failed')?.time;
    const elapsed=typeof start==='number' ? (typeof end==='number' ? Math.max(0,end-start) : step.status==='running' ? Math.max(0,Date.now()-start) : null) : null;
    const usage=step.usage || {};
    return {key,elapsed,model:step.model, cost:typeof usage.cost==='number' && Number.isFinite(usage.cost) && usage.cost>=0 ? usage.cost : null, input:typeof usage.prompt_tokens==='number' ? usage.prompt_tokens : null, output:typeof usage.completion_tokens==='number' ? usage.completion_tokens : null};
  });
  const money=n=>n===null?'—':`$${n.toFixed(4)}`;
  const count=n=>n===null?'—':n.toLocaleString('cs-CZ');
  const costs=values.filter(value=>value.cost!==null);
  const total=costs.length ? costs.reduce((sum,value)=>sum+value.cost,0) : null;
  const complete=values.every(value=>value.cost!==null);
  const rows=values.map(value=>`<tr><th scope="row">${labels[value.key]}</th><td>${value.elapsed===null?'—':duration(value.elapsed)}</td><td>${escape(value.model || '—')}</td><td>${count(value.input)}</td><td>${count(value.output)}</td><td>${money(value.cost)}</td></tr>`).join('');
  return `<section class="statistics"><div class="statistics-heading"><div><p class="eyebrow">PŘEHLED BĚHU</p><h3>Statistiky výzkumu</h3></div><div class="statistics-total"><span>${complete?'Celkové náklady':'Známé náklady'}</span><strong>${money(total)}</strong></div></div><p class="hint">Čas vychází ze zaznamenaných událostí fází. Náklady uvádí OpenRouter v USD, včetně nástrojů, pokud je do ceny zahrnul. Nezahrnují přípravný chat. Chybějící údaje jsou označeny pomlčkou.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Statistiky agentů"><table><thead><tr><th>Agent</th><th>Doba</th><th>Model</th><th>Vstupní tokeny</th><th>Výstupní tokeny</th><th>Cena (USD)</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function render(job){
  const done=Object.values(job.steps).filter(s=>s.status==='done').length;
  const elapsed=(job.finished||Date.now())-job.started;
  const estimate=job.status==='running' && done ? `≈ ${duration(elapsed / done * (4-done))}` : '—';
  const statuses={waiting:'Čeká',running:'Pracuje',done:'Hotovo',failed:'Chyba'};
  const stages=Object.entries(job.steps).map(([key,s],i)=>`<details data-key="${job.id}-${key}"><summary><span class="number">0${i+1}</span><span class="agent"><strong>${labels[key]}</strong><small>${descriptions[key]}</small></span><span class="status ${s.status}">${statuses[s.status]}</span></summary>${s.output?`<div class="output"><div class="meta">MODEL · ${escape(s.model)} ${s.searchCount?` / VYHLEDÁVÁNÍ · ${s.searchCount}`:''}</div><div class="report-text">${markdown(s.output)}</div></div>`:''}</details>`).join('');
  const flow=Object.entries(job.steps).map(([key,s],i)=>`<div class="flow-step ${s.status} ${i<3 ? 'has-next' : ''} ${s.status==='done' && Object.values(job.steps)[i+1]?.status==='running' ? 'handoff-active' : ''}"><div class="flow-top"><span class="flow-icon">${s.status==='done'?'✓':s.status==='running'?'<span class="orb mini" aria-hidden="true"></span>':i+1}</span><span class="flow-badge">${statuses[s.status]}</span></div><span class="flow-copy"><strong>${labels[key]}</strong><small>${descriptions[key]}</small></span><div class="agent-track" aria-hidden="true"><span></span></div><span class="flow-state">${s.status==='running'?'Probíhá zpracování':s.status==='done'?'Fáze dokončena':s.status==='failed'?'Fáze přerušena':'Čeká na předání'}</span></div>`).join('');
  const sourceCount=job.steps.research.status==='done' ? job.steps.research.sourceCount : '—';
  const events=(job.events || []).map(event=>`<li><time>${new Date(event.time).toLocaleTimeString('cs-CZ')}</time><span><strong>${escape(labels[event.stage] || event.stage)}</strong> ${event.type==='started'?'zahájil fázi':event.type==='completed'?`dokončil fázi${event.searchCount ? ` · potvrzeno ${event.searchCount} volání webového hledání` : ''}`:'skončil s chybou'}</span></li>`).join('');
  const timeline=events ? `<section class="timeline"><h3>Průběh výzkumu</h3><p>Skutečné události aplikace. Jednotlivé dotazy uvnitř webového nástroje nejsou v této podobě API dostupné.</p><ol>${events}</ol></section>` : '';
  const report=job.steps.writer.output ? `<section class="final-report"><div class="report-heading"><div><p class="eyebrow">VÝSLEDEK VÝZKUMU</p><h3>Závěrečná zpráva</h3><p>Výstup připravený pro rozhodování. Zdroje a závěry doporučujeme ověřit.</p></div><button class="download" data-id="${job.id}">Stáhnout report ↓</button></div><div class="report-text">${markdown(job.steps.writer.output)}</div></section>` : `<div class="report-pending">${job.status==='failed'?'Závěrečná zpráva nevznikla. Podrobnosti najdete u chyby a jednotlivých kroků.':'Závěrečná zpráva se objeví zde po dokončení všech kroků.'}</div>`;
  return `<article class="job"><div class="job-head"><div><p class="eyebrow">VÝZKUM / ${new Date(job.started).toLocaleString('cs-CZ')}</p><h3>${escape(job.input.topic)}</h3></div><span class="status ${job.status}">${{running:'Probíhá',done:'Dokončeno',failed:'Přerušeno'}[job.status]}</span></div><section class="overview"><div class="overview-title"><div><p class="eyebrow">PRŮBĚH VÝZKUMU</p><h3>${job.status==='running'?`Právě pracuje ${labels[job.current]}`:job.status==='done'?'Výzkum je dokončen':'Výzkum byl přerušen'}</h3></div><strong>${done}<span> / 4 fáze</span></strong></div><div class="progress-track" role="progressbar" aria-label="Dokončené fáze" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${done}"><span style="width:${done*25}%"></span></div><div class="flow">${flow}</div></section>${job.error?`<p class="failure" role="alert">${escape(job.error)}</p>`:''}${report}<details class="run-details steps" data-key="${job.id}-run"${job.status==='running'?' open':''}><summary>Podrobnosti běhu: odkazy, čas a časová osa</summary><div class="metrics"><div><small>NALEZENÉ ODKAZY</small><strong>${sourceCount}</strong><i>unikátní URL, neověřené</i></div><div><small>UPLYNULÝ ČAS</small><strong>${duration(elapsed)}</strong><i>od spuštění</i></div>${job.status==='running'?`<div><small>ODHAD ZBÝVÁ</small><strong>${estimate}</strong><i>orientační odhad</i></div>`:''}</div>${timeline}</details><div class="steps"><p class="eyebrow steps-heading">PRŮBĚH A VÝSTUPY AGENTŮ</p>${stages}</div>${renderStatistics(job)}</article>`;
}
let last=''; async function refresh(){try{const res=await fetch(researchId ? `api/jobs/${encodeURIComponent(researchId)}` : 'api/jobs');if(!res.ok && !(researchId && res.status===404))throw Error('Nepodařilo se načíst výzkumy.'); const data=res.ok ? await res.json() : null; const jobs=researchId ? [] : data; const current=researchId ? data : null; if(!researchId)$('#count').textContent=jobs.length; const html=researchId ? (current ? render(current) : '<div class="empty"><h3>Výzkum nebyl nalezen</h3><p>Zkontrolujte odkaz nebo se vraťte na přehled.</p><a href="./">Zpět na přehled</a></div>') : jobs.map(renderSummary).join(''); const paused=html!==last && !!document.getSelection()?.toString();$('#connection-status').hidden=!paused;$('#connection-status').textContent=paused?'Aktualizace zobrazení je pozastavená při výběru textu.':' ';if((jobs.length || researchId) && html!==last && !paused){const opened=[...document.querySelectorAll('details[open]')].map(x=>x.dataset.key); const focused=document.activeElement?.closest?.('details')?.dataset.key; $('#jobs').innerHTML=html; document.querySelectorAll('details').forEach(x=>{if(opened.includes(x.dataset.key))x.open=true; if(x.dataset.key===focused)x.querySelector('summary').focus();});last=html;} document.querySelectorAll('.download').forEach(b=>b.onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([current.steps.writer.output],{type:'text/markdown'}));a.download='vyzkum.md';a.click();URL.revokeObjectURL(a.href);});}catch{$('#connection-status').hidden=false;$('#connection-status').textContent='Spojení se serverem selhalo. Zobrazený stav nemusí být aktuální; pokoušíme se znovu připojit.';if(researchId && !last)$('#jobs').innerHTML='<div class="empty"><h3>Výzkum se nepodařilo načíst</h3><p>Zkontrolujte, zda aplikace běží.</p><a href="./">Zpět na přehled</a></div>';}} refresh();setInterval(refresh,3000);
