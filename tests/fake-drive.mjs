// 本物のGoogleドライブの代わりに、同じ形で答える偽物（単体の確認とブラウザの確認で使う）
export function fakeDrive() {
  const files = new Map(); let n = 0;
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  const match = (f, q) => q.replace(/ and value=/g, ' AND value=').split(' and ').every(c => {
    c = c.trim();
    let m;
    if ((m = /^mimeType='(.+)'$/.exec(c))) return f.mimeType === m[1];
    if (c === 'trashed=false') return !f.trashed;
    if ((m = /^'(.+)' in parents$/.exec(c))) return (f.parents || []).includes(m[1]);
    if ((m = /^appProperties has \{ key='(.+)' AND value='(.*)' \}$/.exec(c))) return f.appProperties?.[m[1]] === m[2];
    throw new Error('unknown query ' + c);
  });
  async function parseMultipart(body, type) {
    const B = /boundary=(.+)$/.exec(type)[1], text = await body.text();
    const parts = text.split(`--${B}`).slice(1, -1).map(p => p.replace(/^\r\n/, '').replace(/\r\n$/, ''));
    const [meta, data] = parts.map(p => p.slice(p.indexOf('\r\n\r\n') + 4));
    return { meta: JSON.parse(meta), data };
  }
  const fetch = async (url, opt = {}) => {
    const u = new URL(url), method = opt.method || 'GET';
    if (!opt.headers?.Authorization?.startsWith('Bearer ')) return json({ error: { message: 'no auth' } }, 401);
    const idm = /\/files\/([^/?]+)/.exec(u.pathname);
    if (method === 'GET' && !idm) return json({ files: [...files.values()].filter(f => match(f, u.searchParams.get('q'))).map(({ content, ...f }) => f) });
    if (method === 'POST' && u.pathname.startsWith('/drive')) { const meta = JSON.parse(opt.body), id = 'f' + (++n); files.set(id, { id, version: 1, modifiedTime: new Date().toISOString(), ...meta }); return json({ id }); }
    if (method === 'POST' && u.pathname.startsWith('/upload')) { const { meta, data } = await parseMultipart(opt.body, opt.headers['Content-Type']); const id = 'f' + (++n); files.set(id, { id, version: 1, ...meta, content: data }); return json({ id, version: 1 }); }
    const f = files.get(idm[1]);
    if (!f) return json({ error: { message: 'not found' } }, 404);
    if (method === 'GET' && u.searchParams.get('alt') === 'media') return new Response(f.content);
    if (method === 'GET') return json({ version: f.version });
    if (method === 'PATCH' && u.pathname.startsWith('/upload')) { f.content = opt.body; f.version++; return json({ version: f.version }); }
    if (method === 'PATCH') { Object.assign(f, JSON.parse(opt.body)); return json({ id: f.id }); }
    return json({ error: { message: 'unsupported' } }, 400);
  };
  return { fetch, files };
}
