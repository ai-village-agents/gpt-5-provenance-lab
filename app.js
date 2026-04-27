(async function(){
  const statusEl = document.getElementById('status');
  const marksEl = document.getElementById('marks');
  const owner = 'ai-village-agents';
  const repo = 'gpt-5-provenance-lab';
  const listUrl = `https://api.github.com/repos/${owner}/${repo}/issues?labels=anchor&state=open&per_page=50`;
  const ttlMs = 3 * 60 * 1000;
  const cacheKey = 'lab_cache_v1';
  const now = Date.now();
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const obj = JSON.parse(cached);
      if (now - obj.when < ttlMs) {
        render(obj.issues, `(cached at ${new Date(obj.when).toISOString()})`);
        return;
      }
    }
  } catch {}
  setStatus('Loading');
  let issues = await primary();
  if (!issues || issues.length === 0) {
    issues = await fallbackProbe();
  }
  if (!issues) issues = [];
  issues.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
  render(issues);
  try { sessionStorage.setItem(cacheKey, JSON.stringify({when: now, issues})); } catch {}
  async function primary(){
    try {
      const res = await fetch(listUrl, { headers: { 'Accept':'application/vnd.github+json' }});
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) ? data : null;
    } catch { return null; }
  }
  async function fallbackProbe(){
    try {
      const headRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?per_page=1&state=all&sort=created&direction=desc`);
      if (!headRes.ok) return null;
      const head = await headRes.json();
      const latest = Array.isArray(head) && head[0] ? head[0].number : 0;
      if (!latest) return null;
      const out = [];
      for (let n=latest; n>0 && out.length<10; n--) {
        const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${n}`);
        if (!r.ok) continue;
        const it = await r.json();
        if (Array.isArray(it.labels) && it.labels.find(l=> (l.name||'')==='anchor')) out.push(it);
      }
      return out;
    } catch { return null; }
  }
  function normalize(i){
    return {
      number: i.number,
      title: i.title,
      user: i.user && i.user.login,
      labels: (i.labels||[]).map(l=>l.name),
      created_at: i.created_at,
      body: i.body||''
    };
  }
  async function fingerprint(i){
    const enc = new TextEncoder();
    const norm = JSON.stringify(normalize(i));
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(norm));
    const bytes = Array.from(new Uint8Array(buf));
    return bytes.map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function render(list, note){
    if (!list || list.length===0) { setStatus('No canonical anchors found yet.'); return; }
    setStatus(`Showing ${list.length} canonical anchors${note? ' ' + note: ''}. Last fetched at ${new Date().toISOString()} (UTC).`);
    marksEl.innerHTML = '';
    for (const it of list){
      const fp = await fingerprint(it);
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <h3>${escapeHtml(it.title||'Untitled')}</h3>
        <p class=\"meta\">#${it.number}  ${new Date(it.created_at).toISOString()}</p>
        <p class=\"hash\">SHA-256: <code>${fp}</code></p>
        <p><a href=\"https://github.com/${owner}/${repo}/issues/${it.number}\" target=\"_blank\" rel=\"noopener\">Canonical Issue</a></p>`;
      marksEl.appendChild(card);
    }
  }
  function setStatus(t){ statusEl.textContent = t; }
  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }
})();
