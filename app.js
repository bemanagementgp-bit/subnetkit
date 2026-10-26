/* ===== SubnetKit – IP Subnet Calculator (vanilla JS, no deps). Pure math lives in window.SubnetMath ===== */
(function (global) {
  'use strict';

  /* ======================================================================
     PURE MATH – no DOM. Exposed as window.SubnetMath for tests.
     ====================================================================== */
  const M = {};

  // ---------- IPv4 ----------
  M.ip4ToInt = function (s) {
    if (typeof s !== 'string') return null;
    const parts = s.trim().split('.');
    if (parts.length !== 4) return null;
    let n = 0;
    for (let i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(parts[i])) return null;
      const v = Number(parts[i]);
      if (v > 255) return null;
      n = n * 256 + v;
    }
    return n;
  };
  M.intToIp4 = function (n) {
    n = Number(n);
    return [Math.floor(n / 16777216) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  };
  M.prefixToMask = function (p) { return p <= 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0; };
  M.maskToPrefix = function (maskStr) {
    const n = typeof maskStr === 'number' ? maskStr : M.ip4ToInt(maskStr);
    if (n === null) return null;
    let p = 0;
    for (let i = 31; i >= 0; i--) { if ((n >>> i) & 1) p++; else break; }
    return M.prefixToMask(p) === n ? p : null;
  };
  M.wildcardToPrefix = function (wStr) {
    const n = M.ip4ToInt(wStr);
    if (n === null) return null;
    return M.maskToPrefix((~n) >>> 0);
  };
  M.blockSize = function (p) { return Math.pow(2, 32 - p); };
  M.usableHosts = function (p) { return p === 32 ? 1 : p === 31 ? 2 : M.blockSize(p) - 2; };

  // Parse "a.b.c.d", "a.b.c.d/24", "a.b.c.d/255.255.255.0", "a.b.c.d/0.0.0.255", "a.b.c.d 255.255.255.0", "a.b.c.d 0.0.0.255"
  M.parseIPv4 = function (text, defaultPrefix) {
    const s = String(text || '').trim().replace(/\s+/g, ' ');
    if (!s) return { error: 'Enter an IPv4 address.' };
    const m = s.match(/^([^\s\/]+)(?:\s*[\/\s]\s*([^\s\/]+))?$/);
    if (!m) return { error: 'Unrecognized format. Use 192.168.1.10/24 or 192.168.1.10 255.255.255.0.' };
    const ip = M.ip4ToInt(m[1]);
    if (ip === null) return { error: 'Invalid IPv4 address "' + m[1] + '". Use four octets 0–255.' };
    let prefix = defaultPrefix == null ? 24 : defaultPrefix;
    if (m[2] !== undefined) {
      const t = m[2];
      if (/^\d{1,2}$/.test(t)) {
        prefix = Number(t);
        if (prefix > 32) return { error: 'Prefix must be between /0 and /32.' };
      } else {
        const pm = M.maskToPrefix(t);
        const pw = M.wildcardToPrefix(t);
        // 0.0.0.0 and 255.255.255.255 are ambiguous: treat as mask
        if (pm !== null) prefix = pm;
        else if (pw !== null) prefix = pw;
        else return { error: '"' + t + '" is not a valid prefix, subnet mask or wildcard mask.' };
      }
    }
    return { ip: ip, prefix: prefix };
  };

  M.ip4Class = function (ip) {
    const o = Math.floor(ip / 16777216);
    if (o < 128) return 'A';
    if (o < 192) return 'B';
    if (o < 224) return 'C';
    if (o < 240) return 'D';
    return 'E';
  };
  M.inBlock4 = function (ip, netStr, p) {
    const net = M.ip4ToInt(netStr);
    const mask = M.prefixToMask(p);
    return ((ip & mask) >>> 0) === ((net & mask) >>> 0);
  };
  const IP4_TYPES = [
    ['0.0.0.0', 8, 'This network (RFC 1122)'],
    ['10.0.0.0', 8, 'Private (RFC 1918)'],
    ['100.64.0.0', 10, 'Carrier-grade NAT (RFC 6598)'],
    ['127.0.0.0', 8, 'Loopback'],
    ['169.254.0.0', 16, 'Link-local (APIPA, RFC 3927)'],
    ['172.16.0.0', 12, 'Private (RFC 1918)'],
    ['192.0.0.0', 24, 'IETF protocol assignments'],
    ['192.0.2.0', 24, 'Documentation (TEST-NET-1)'],
    ['192.88.99.0', 24, '6to4 relay anycast (deprecated)'],
    ['192.168.0.0', 16, 'Private (RFC 1918)'],
    ['198.18.0.0', 15, 'Benchmarking (RFC 2544)'],
    ['198.51.100.0', 24, 'Documentation (TEST-NET-2)'],
    ['203.0.113.0', 24, 'Documentation (TEST-NET-3)'],
    ['224.0.0.0', 4, 'Multicast'],
    ['255.255.255.255', 32, 'Limited broadcast'],
    ['240.0.0.0', 4, 'Reserved (RFC 1112)']
  ];
  M.ip4Type = function (ip) {
    for (const t of IP4_TYPES) if (M.inBlock4(ip, t[0], t[1])) return t[2];
    return 'Public (globally routable)';
  };
  M.bin32 = function (n) {
    const s = (n >>> 0).toString(2).padStart(32, '0');
    return [s.slice(0, 8), s.slice(8, 16), s.slice(16, 24), s.slice(24, 32)];
  };
  M.reverseDns4 = function (ip) { return M.intToIp4(ip).split('.').reverse().join('.') + '.in-addr.arpa'; };

  M.ipv4Info = function (ip, p) {
    const mask = M.prefixToMask(p);
    const wild = (~mask) >>> 0;
    const network = (ip & mask) >>> 0;
    const broadcast = (network | wild) >>> 0;
    const total = M.blockSize(p);
    const usable = M.usableHosts(p);
    const first = p >= 31 ? network : network + 1;
    const last = p >= 31 ? broadcast : broadcast - 1;
    return {
      ip: ip, prefix: p, mask: mask, wildcard: wild, network: network, broadcast: broadcast,
      total: total, usable: usable, first: first, last: last,
      ipStr: M.intToIp4(ip), maskStr: M.intToIp4(mask), wildcardStr: M.intToIp4(wild),
      networkStr: M.intToIp4(network), broadcastStr: M.intToIp4(broadcast),
      firstStr: M.intToIp4(first), lastStr: M.intToIp4(last),
      cidr: M.intToIp4(network) + '/' + p,
      cls: M.ip4Class(ip), type: M.ip4Type(ip),
      hex: '0x' + (ip >>> 0).toString(16).toUpperCase().padStart(8, '0'),
      integer: ip >>> 0,
      rdns: M.reverseDns4(ip),
      binIp: M.bin32(ip), binMask: M.bin32(mask), binNet: M.bin32(network)
    };
  };

  // Split network/prefix into subnets of newPrefix. Returns {count, rows (<= limit)}
  M.splitIPv4 = function (network, p, newP, limit) {
    if (newP <= p) return { error: 'New prefix must be larger than /' + p + '.' };
    if (newP > 32) return { error: 'Prefix cannot exceed /32.' };
    const count = Math.pow(2, newP - p);
    const size = M.blockSize(newP);
    const rows = [];
    const n = limit ? Math.min(limit, count) : count;
    for (let i = 0; i < n; i++) {
      const net = network + i * size;
      const info = M.ipv4Info(net, newP);
      rows.push({ index: i + 1, network: info.cidr, networkStr: info.networkStr, first: info.firstStr, last: info.lastStr, broadcast: info.broadcastStr, hosts: info.usable });
    }
    return { count: count, size: size, rows: rows, truncated: n < count };
  };

  // Classic greedy range → CIDR
  M.rangeToCidr = function (start, end) {
    const out = [];
    if (start > end) return out;
    let s = start;
    while (s <= end) {
      let maxSize = 32;
      while (maxSize > 0) {
        const mask = M.prefixToMask(maxSize - 1);
        if (((s & mask) >>> 0) !== s) break;
        maxSize--;
      }
      const maxDiff = 32 - Math.floor(Math.log2(end - s + 1));
      if (maxSize < maxDiff) maxSize = maxDiff;
      out.push({ network: s, prefix: maxSize });
      s += Math.pow(2, 32 - maxSize);
    }
    return out;
  };

  M.cidrString = function (c) { return M.intToIp4(c.network) + '/' + c.prefix; };

  // Parse list of CIDRs (text). Returns {blocks, errors}
  M.parseCidrList = function (text) {
    const tokens = String(text || '').split(/[\s,;]+/).filter(Boolean);
    const blocks = [], errors = [];
    tokens.forEach(function (t) {
      const r = M.parseIPv4(t, 32);
      if (r.error) { errors.push(t); return; }
      const info = M.ipv4Info(r.ip, r.prefix);
      blocks.push({ network: info.network, prefix: r.prefix, input: t, cidr: info.cidr, normalized: info.cidr !== t });
    });
    return { blocks: blocks, errors: errors };
  };

  // Aggregate: merge overlapping/adjacent ranges then re-express as minimal CIDRs
  M.aggregate = function (blocks) {
    const ranges = blocks.map(function (b) {
      return { start: b.network, end: b.network + M.blockSize(b.prefix) - 1, src: [b] };
    }).sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    const merged = [];
    ranges.forEach(function (r) {
      const last = merged[merged.length - 1];
      if (last && r.start <= last.end + 1) {
        if (r.end > last.end) last.end = r.end;
        last.src = last.src.concat(r.src);
      } else merged.push({ start: r.start, end: r.end, src: r.src.slice() });
    });
    const out = [];
    merged.forEach(function (r) {
      M.rangeToCidr(r.start, r.end).forEach(function (c) {
        const cEnd = c.network + M.blockSize(c.prefix) - 1;
        out.push({ network: c.network, prefix: c.prefix, cidr: M.cidrString(c), first: c.network, last: cEnd,
          covers: r.src.filter(function (b) { const bEnd = b.network + M.blockSize(b.prefix) - 1; return b.network >= c.network && bEnd <= cEnd; }).map(function (b) { return b.cidr; }) });
      });
    });
    return out;
  };

  // VLSM
  M.vlsm = function (baseNet, baseP, reqs, useP31) {
    const base = M.ipv4Info(baseNet, baseP);
    const items = reqs.map(function (r, i) { return { name: r.name, hosts: r.hosts, order: i }; })
      .filter(function (r) { return r.hosts > 0; })
      .sort(function (a, b) { return b.hosts - a.hosts || a.order - b.order; });
    let cursor = base.network;
    const limit = base.broadcast;
    const rows = [];
    let error = null;
    for (const it of items) {
      let p;
      if (useP31 && it.hosts <= 2) p = it.hosts === 1 ? 32 : 31;
      else p = 32 - Math.ceil(Math.log2(it.hosts + 2));
      if (p < 0) { error = it.name + ' needs more hosts than IPv4 allows.'; break; }
      const size = M.blockSize(p);
      // align cursor to block boundary
      cursor = Math.ceil(cursor / size) * size;
      if (cursor + size - 1 > limit || cursor > 0xFFFFFFFF) {
        error = 'Address space exhausted: "' + it.name + '" needs ' + it.hosts + ' hosts (/' + p + ', ' + size + ' addresses) but only ' + Math.max(0, limit - cursor + 1) + ' addresses remain in ' + base.cidr + '.';
        break;
      }
      const info = M.ipv4Info(cursor, p);
      rows.push({ name: it.name, needed: it.hosts, prefix: p, size: size, usable: info.usable, cidr: info.cidr,
        mask: info.maskStr, first: info.firstStr, last: info.lastStr, broadcast: info.broadcastStr, wasted: info.usable - it.hosts });
      cursor += size;
    }
    const used = rows.reduce(function (a, r) { return a + r.size; }, 0);
    const needed = rows.reduce(function (a, r) { return a + r.needed; }, 0);
    return {
      ok: !error, error: error, rows: rows, base: base,
      used: used, remaining: base.total - used,
      efficiency: used ? Math.round(needed / used * 1000) / 10 : 0,
      nextFree: cursor <= limit ? M.intToIp4(cursor) : null
    };
  };

  M.prefixTable = function () {
    const rows = [];
    for (let p = 0; p <= 32; p++) {
      const mask = M.prefixToMask(p);
      rows.push({ prefix: p, mask: M.intToIp4(mask), wildcard: M.intToIp4((~mask) >>> 0), total: M.blockSize(p), usable: M.usableHosts(p) });
    }
    return rows;
  };

  // ---------- IPv6 (BigInt) ----------
  const B128 = (1n << 128n) - 1n;
  M.parseIPv6 = function (text) {
    let s = String(text || '').trim().toLowerCase();
    if (!s) return { error: 'Enter an IPv6 address.' };
    let prefix = 128, hadPrefix = false;
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length !== 2 || !/^\d{1,3}$/.test(parts[1])) return { error: 'Invalid prefix length.' };
      prefix = Number(parts[1]); hadPrefix = true;
      if (prefix > 128) return { error: 'Prefix must be between /0 and /128.' };
      s = parts[0];
    }
    s = s.replace(/^\[|\]$/g, '');
    if (!/^[0-9a-f:.]+$/.test(s)) return { error: 'Invalid characters in IPv6 address.' };
    if (s.includes('.')) {
      const idx = s.lastIndexOf(':');
      if (idx < 0) return { error: 'Invalid IPv6 address.' };
      const v4 = M.ip4ToInt(s.slice(idx + 1));
      if (v4 === null) return { error: 'Invalid embedded IPv4 address.' };
      s = s.slice(0, idx + 1) + (v4 >>> 16).toString(16) + ':' + (v4 & 0xffff).toString(16);
    }
    const dc = s.split('::');
    if (dc.length > 2) return { error: 'Only one "::" is allowed.' };
    const head = dc[0] ? dc[0].split(':') : [];
    const tail = dc.length === 2 ? (dc[1] ? dc[1].split(':') : []) : null;
    if (tail === null && head.length !== 8) return { error: 'An IPv6 address needs 8 groups (or use "::" to compress zeros).' };
    if (tail !== null && head.length + tail.length > 7) return { error: '"::" must replace at least one zero group.' };
    const groups = tail === null ? head : head.concat(new Array(8 - head.length - tail.length).fill('0'), tail);
    let addr = 0n;
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return { error: 'Invalid group "' + g + '" – each group is 1–4 hex digits.' };
      addr = (addr << 16n) | BigInt(parseInt(g, 16));
    }
    return { addr: addr, prefix: prefix, hadPrefix: hadPrefix };
  };
  M.ip6Groups = function (addr) {
    const g = [];
    for (let i = 7; i >= 0; i--) g.push(Number((addr >> BigInt(i * 16)) & 0xffffn));
    return g;
  };
  M.ip6Expand = function (addr) { return M.ip6Groups(addr).map(function (g) { return g.toString(16).padStart(4, '0'); }).join(':'); };
  M.ip6Compress = function (addr) {
    const g = M.ip6Groups(addr);
    let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
    for (let i = 0; i <= 8; i++) {
      if (i < 8 && g[i] === 0) { if (curStart < 0) { curStart = i; curLen = 1; } else curLen++; }
      else { if (curLen > bestLen) { bestStart = curStart; bestLen = curLen; } curStart = -1; curLen = 0; }
    }
    const hex = g.map(function (x) { return x.toString(16); });
    if (bestLen < 2) return hex.join(':');
    const left = hex.slice(0, bestStart).join(':');
    const right = hex.slice(bestStart + bestLen).join(':');
    return left + '::' + right;
  };
  M.ip6Mask = function (p) { return p <= 0 ? 0n : (B128 << BigInt(128 - p)) & B128; };
  const IP6_TYPES = [
    ['::', 128, 'Unspecified'],
    ['::1', 128, 'Loopback'],
    ['::ffff:0:0', 96, 'IPv4-mapped'],
    ['64:ff9b::', 96, 'IPv4/IPv6 translation (NAT64)'],
    ['2001:db8::', 32, 'Documentation (RFC 3849)'],
    ['2001::', 32, 'Teredo tunneling'],
    ['2002::', 16, '6to4'],
    ['fc00::', 7, 'Unique local (ULA, fc00::/7)'],
    ['fe80::', 10, 'Link-local (fe80::/10)'],
    ['ff00::', 8, 'Multicast (ff00::/8)'],
    ['2000::', 3, 'Global unicast']
  ].map(function (t) { return { net: M.parseIPv6(t[0]).addr, p: t[1], label: t[2] }; });
  M.ip6Type = function (addr) {
    for (const t of IP6_TYPES) { const m = M.ip6Mask(t.p); if ((addr & m) === (t.net & m)) return t.label; }
    return 'Reserved / unassigned';
  };
  M.ip6ReverseDns = function (addr) {
    const hex = addr.toString(16).padStart(32, '0');
    return hex.split('').reverse().join('.') + '.ip6.arpa';
  };
  M.fmtBig = function (n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  M.ipv6Info = function (addr, p) {
    const mask = M.ip6Mask(p);
    const network = addr & mask;
    const last = network | (B128 ^ mask);
    const total = 1n << BigInt(128 - p);
    const hi64 = (addr >> 64n).toString(2).padStart(64, '0');
    return {
      addr: addr, prefix: p, network: network, first: network, last: last, total: total,
      compressed: M.ip6Compress(addr), expanded: M.ip6Expand(addr),
      networkStr: M.ip6Compress(network), cidr: M.ip6Compress(network) + '/' + p,
      firstStr: M.ip6Compress(network), lastStr: M.ip6Compress(last), lastExpanded: M.ip6Expand(last),
      totalStr: M.fmtBig(total), totalPow: '2^' + (128 - p),
      type: M.ip6Type(addr), rdns: M.ip6ReverseDns(addr),
      bin64: [hi64.slice(0, 16), hi64.slice(16, 32), hi64.slice(32, 48), hi64.slice(48, 64)]
    };
  };
  M.splitIPv6 = function (network, p, newP, limit) {
    if (newP <= p) return { error: 'New prefix must be larger than /' + p + '.' };
    if (newP > 128) return { error: 'Prefix cannot exceed /128.' };
    const count = 1n << BigInt(newP - p);
    const size = 1n << BigInt(128 - newP);
    const n = Number(count > BigInt(limit) ? BigInt(limit) : count);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const net = network + BigInt(i) * size;
      rows.push({ index: i + 1, cidr: M.ip6Compress(net) + '/' + newP, first: M.ip6Compress(net), last: M.ip6Compress(net + size - 1n) });
    }
    return { count: count, countStr: M.fmtBig(count), rows: rows, truncated: BigInt(n) < count };
  };

  global.SubnetMath = M;

  /* ======================================================================
     UI – only when a real DOM is present
     ====================================================================== */
  if (typeof document === 'undefined' || !document.getElementById) return;

  const C = global.APP_CONFIG || {};
  const LS_STATE = 'sk_state_v1';
  const LS_PROJECTS = 'sk_projects_v1';
  const TABS = ['ipv4', 'vlsm', 'ipv6', 'cidr', 'supernet'];
  const FREE_SPLIT_ROWS = 64;
  const FREE_VLSM_ROWS = 5;
  const FREE_PROJECTS = 1;
  const DEFAULT_VLSM = [['Sales', 50], ['IT', 25], ['Mgmt', 10], ['Link-A', 2], ['Link-B', 2]];
  const DEFAULTS = {
    ip4Addr: '192.168.1.10', ip4Prefix: '24', ip4Mask: '255.255.255.0', ip4SplitMode: 'prefix', ip4SplitPrefix: '26', ip4SplitCount: '4',
    vlsmBase: '192.168.10.0/24', vlsmP2P: false,
    ip6Addr: '2001:db8:85a3::8a2e:370:7334/64', ip6SplitPrefix: '68',
    cidrIn: '10.0.0.0/22', rangeStart: '10.0.0.1', rangeEnd: '10.0.0.254', chkIp: '192.168.1.130', chkCidr: '192.168.1.0/25',
    snInput: '192.168.0.0/24\n192.168.1.0/24\n192.168.2.0/24\n192.168.3.0/24\n10.10.0.0/16\n10.10.5.0/24\n172.16.4.0/22\n172.16.8.0/22'
  };

  const $ = function (id) { return document.getElementById(id); };
  const els = {};
  let activeTab = 'ipv4';
  let syncing = false;
  const last = { ipv4: null, vlsm: null, ipv6: null, cidr: null, supernet: null };
  const lastText = { ipv4: '', vlsm: '', ipv6: '', cidr: '', supernet: '' };
  const baseText = { ipv4: '', ipv6: '' };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtNum(n) { return Number(n).toLocaleString('en-US'); }
  function setErr(el, msg) { if (el) el.textContent = msg || ''; }
  function show(el, on) { if (el) el.classList.toggle('hidden', !on); }
  function copyText(text, msg) {
    const done = function () { toast(msg || 'Copied to clipboard'); track('copy', { tab: activeTab }); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } document.body.removeChild(ta);
  }
  function kvHtml(rows) {
    return rows.map(function (r) {
      const wide = r.wide ? ' class="wide"' : '';
      const plain = r.plain ? ' class="plain"' : '';
      const val = r.html ? r.html : esc(r.v);
      const copy = r.copy === false ? '' : '<button class="copy-mini no-print" type="button" data-copy="' + esc(r.v) + '" aria-label="Copy ' + esc(r.k) + '">copy</button>';
      return '<div' + wide + '><dt>' + esc(r.k) + '</dt><dd' + plain + '><span>' + val + '</span>' + copy + '</dd></div>';
    }).join('');
  }
  function binLine(label, groups, prefix, bitsPerGroup) {
    let html = '<span class="lbl">' + esc(label) + '</span>';
    let bit = 0;
    const parts = groups.map(function (g) {
      let out = '';
      let netRun = '', hostRun = '';
      for (let i = 0; i < g.length; i++) {
        if (bit < prefix) netRun += g[i]; else hostRun += g[i];
        bit++;
      }
      if (netRun) out += '<span class="net">' + netRun + '</span>';
      if (hostRun) out += '<span class="host">' + hostRun + '</span>';
      return out;
    });
    return html + parts.join(bitsPerGroup === 16 ? ':' : '.') + '<br>';
  }

  /* ---------------- persistence ---------------- */
  function collectState() {
    const st = {};
    document.querySelectorAll('[data-persist]').forEach(function (el) { st[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    st.vlsmRows = getVlsmRows();
    st.tab = activeTab;
    return st;
  }
  function applyState(st) {
    if (!st) return;
    syncing = true;
    document.querySelectorAll('[data-persist]').forEach(function (el) {
      if (!(el.id in st)) return;
      if (el.type === 'checkbox') el.checked = !!st[el.id];
      else el.value = st[el.id];
    });
    if (Array.isArray(st.vlsmRows)) renderVlsmRows(st.vlsmRows);
    syncing = false;
  }
  function saveState() { try { localStorage.setItem(LS_STATE, JSON.stringify(collectState())); } catch (e) { /* ignore */ } }
  function loadState() { try { return JSON.parse(localStorage.getItem(LS_STATE) || 'null'); } catch (e) { return null; } }

  /* ---------------- tabs ---------------- */
  function setTab(name, push) {
    if (TABS.indexOf(name) < 0) name = 'ipv4';
    activeTab = name;
    document.querySelectorAll('#tabBar .tab').forEach(function (b) {
      const on = b.dataset.tab === name;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    TABS.forEach(function (t) { $('panel-' + t).classList.toggle('active', t === name); });
    if (push !== false && location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    saveState();
  }

  /* ---------------- IPv4 tab ---------------- */
  function fillIp4Selects() {
    let po = '', mo = '';
    for (let p = 0; p <= 32; p++) {
      po += '<option value="' + p + '">/' + p + '</option>';
      mo += '<option value="' + M.intToIp4(M.prefixToMask(p)) + '">' + M.intToIp4(M.prefixToMask(p)) + ' (/' + p + ')</option>';
    }
    els.ip4Prefix.innerHTML = po; els.ip4Mask.innerHTML = mo;
    let co = '';
    for (let i = 1; i <= 32; i++) co += '<option value="' + i + '">' + fmtNum(Math.pow(2, i)) + ' (' + i + ' bit' + (i > 1 ? 's' : '') + ')</option>';
    els.ip4SplitCount.innerHTML = co;
  }
  function fillSplitPrefix(cur) {
    const prev = els.ip4SplitPrefix.value;
    let o = '';
    for (let p = cur + 1; p <= 32; p++) o += '<option value="' + p + '">/' + p + ' (' + fmtNum(Math.pow(2, p - cur)) + ' subnets, ' + fmtNum(M.usableHosts(p)) + ' hosts)</option>';
    els.ip4SplitPrefix.innerHTML = o || '<option value="">–</option>';
    if (prev && Number(prev) > cur) els.ip4SplitPrefix.value = prev;
    else els.ip4SplitPrefix.value = String(Math.min(32, cur + 2));
    if (!els.ip4SplitPrefix.value && o) els.ip4SplitPrefix.selectedIndex = 0;
  }
  function onIp4Free() {
    const t = els.ip4Free.value.trim();
    if (!t) { setErr(els.ip4Err, ''); return; }
    const r = M.parseIPv4(t, Number(els.ip4Prefix.value));
    if (r.error) { setErr(els.ip4Err, r.error); return; }
    syncing = true;
    els.ip4Addr.value = M.intToIp4(r.ip);
    els.ip4Prefix.value = String(r.prefix);
    els.ip4Mask.value = M.intToIp4(M.prefixToMask(r.prefix));
    syncing = false;
    setErr(els.ip4Err, '');
    calcIp4();
  }
  function calcIp4() {
    try {
      const ip = M.ip4ToInt(els.ip4Addr.value);
      if (ip === null) { setErr(els.ip4Err, 'Invalid IPv4 address – use four octets 0–255, e.g. 192.168.1.10.'); show(els.ip4Results, false); show(els.ip4SplitOut, false); last.ipv4 = null; return; }
      const p = Number(els.ip4Prefix.value);
      setErr(els.ip4Err, '');
      show(els.ip4Results, true);
      const info = M.ipv4Info(ip, p);
      last.ipv4 = info;
      els.ip4Grid.innerHTML = kvHtml([
        { k: 'Network address', v: info.cidr },
        { k: 'Broadcast address', v: p >= 31 ? info.broadcastStr + (p === 31 ? ' (none on /31)' : ' (host route)') : info.broadcastStr },
        { k: 'First usable host', v: info.firstStr },
        { k: 'Last usable host', v: info.lastStr },
        { k: 'Usable hosts', v: fmtNum(info.usable) + (p === 31 ? ' (point-to-point, RFC 3021)' : p === 32 ? ' (single host)' : ''), copy: false },
        { k: 'Total addresses', v: fmtNum(info.total) + ' (2^' + (32 - p) + ')', copy: false },
        { k: 'Subnet mask', v: info.maskStr },
        { k: 'Wildcard mask', v: info.wildcardStr },
        { k: 'CIDR notation', v: info.ipStr + '/' + p },
        { k: 'IP class', v: 'Class ' + info.cls + (info.cls === 'D' ? ' (multicast)' : info.cls === 'E' ? ' (experimental)' : ''), plain: true, copy: false },
        { k: 'Address type', v: info.type, plain: true, copy: false },
        { k: 'Hex / integer', v: info.hex + ' / ' + fmtNum(info.integer) },
        { k: 'Reverse DNS (PTR)', v: info.rdns, wide: true }
      ]);
      els.ip4Bin.innerHTML = binLine('Address', info.binIp, p, 8) + binLine('Mask', info.binMask, p, 8) + binLine('Network', info.binNet, p, 8) +
        '<div class="legend"><span><i></i>Network bits (' + p + ')</span><span>Host bits (' + (32 - p) + ')</span></div>';
      if (els.ip4ReportMeta) els.ip4ReportMeta.textContent = 'Split of ' + info.cidr + ' (' + info.maskStr + ')';
      fillSplitPrefix(p);
      baseText.ipv4 = lastText.ipv4 = [
        'SubnetKit – IPv4 subnet ' + info.ipStr + '/' + p,
        'Network: ' + info.cidr, 'Broadcast: ' + info.broadcastStr,
        'Usable hosts: ' + info.firstStr + ' – ' + info.lastStr + ' (' + fmtNum(info.usable) + ')',
        'Total addresses: ' + fmtNum(info.total), 'Subnet mask: ' + info.maskStr, 'Wildcard mask: ' + info.wildcardStr,
        'Class: ' + info.cls, 'Type: ' + info.type, 'Hex: ' + info.hex, 'Integer: ' + info.integer, 'Reverse DNS: ' + info.rdns,
        'Binary address: ' + info.binIp.join('.'), 'Binary mask: ' + info.binMask.join('.')
      ].join('\n');
      calcIp4Split();
      track('calculate', { tab: 'ipv4' });
    } catch (e) { setErr(els.ip4Err, 'Could not calculate: ' + e.message); }
  }
  function calcIp4Split() {
    const info = last.ipv4;
    if (!info) { show(els.ip4SplitOut, false); return; }
    const byCount = els.ip4SplitMode.value === 'count';
    show(els.ip4SplitPrefixWrap, !byCount); show(els.ip4SplitCountWrap, byCount);
    let newP;
    if (byCount) newP = info.prefix + Number(els.ip4SplitCount.value);
    else newP = Number(els.ip4SplitPrefix.value);
    if (!isFinite(newP) || newP > 32) { setErr(els.ip4SplitErr, byCount ? 'Too many subnets: /' + info.prefix + ' can hold at most ' + fmtNum(Math.pow(2, 32 - info.prefix)) + ' /32 subnets.' : 'Choose a prefix larger than /' + info.prefix + '.'); show(els.ip4SplitOut, false); return; }
    const r = M.splitIPv4(info.network, info.prefix, newP, isPro() ? 4096 : FREE_SPLIT_ROWS);
    if (r.error) { setErr(els.ip4SplitErr, r.error); show(els.ip4SplitOut, false); return; }
    setErr(els.ip4SplitErr, ''); show(els.ip4SplitOut, true);
    els.ip4SplitBody.innerHTML = r.rows.map(function (s) {
      return '<tr><td class="num">' + s.index + '</td><td>' + s.network + '</td><td>' + s.first + ' – ' + s.last + '</td><td>' + s.broadcast + '</td><td class="num">' + fmtNum(s.hosts) + '</td></tr>';
    }).join('');
    const note = fmtNum(r.count) + ' subnets of /' + newP + ' (' + fmtNum(r.size) + ' addresses, ' + fmtNum(M.usableHosts(newP)) + ' usable hosts each).';
    els.ip4SplitNote.textContent = r.truncated ? note + (isPro() ? ' Showing the first ' + r.rows.length + ' rows.' : ' Free plan shows the first ' + FREE_SPLIT_ROWS + ' rows – Pro lists up to 4,096 and exports CSV.') : note;
    lastText.ipv4 = baseText.ipv4 + '\n\nSplit into /' + newP + ' (' + note + ')\n' + tableToText(els.ip4SplitTable);
  }

  /* ---------------- VLSM tab ---------------- */
  function getVlsmRows() {
    return Array.prototype.map.call(els.vlsmRows.querySelectorAll('.vlsm-row'), function (r) {
      return { name: r.querySelector('.v-name').value, hosts: r.querySelector('.v-hosts').value };
    });
  }
  function renderVlsmRows(rows) {
    els.vlsmRows.innerHTML = rows.map(function (r, i) {
      return '<div class="vlsm-row"><input type="text" class="v-name mono" value="' + esc(r.name) + '" placeholder="Name" aria-label="Subnet ' + (i + 1) + ' name" maxlength="40">' +
        '<input type="number" class="v-hosts mono" value="' + esc(r.hosts) + '" min="1" max="1073741822" step="1" inputmode="numeric" placeholder="Hosts" aria-label="Subnet ' + (i + 1) + ' hosts">' +
        '<button class="btn rm" type="button" data-rm="' + i + '" aria-label="Remove subnet ' + (i + 1) + '">✕</button></div>';
    }).join('');
    updateVlsmHint();
  }
  function updateVlsmHint() {
    const n = els.vlsmRows.querySelectorAll('.vlsm-row').length;
    els.vlsmLimitHint.textContent = isPro() ? n + ' networks (unlimited)' : n + ' of ' + FREE_VLSM_ROWS + ' free networks';
  }
  function addVlsmRow() {
    const rows = getVlsmRows();
    if (!isPro() && rows.length >= FREE_VLSM_ROWS) { openPro('vlsm'); return; }
    rows.push({ name: 'Net-' + (rows.length + 1), hosts: '10' });
    renderVlsmRows(rows);
    const inputs = els.vlsmRows.querySelectorAll('.v-name');
    if (inputs.length) inputs[inputs.length - 1].focus();
    saveState(); calcVlsm();
  }
  function calcVlsm() {
    try {
      const r = M.parseIPv4(els.vlsmBase.value, 24);
      if (r.error) { setErr(els.vlsmErr, r.error); show(els.vlsmOut, false); last.vlsm = null; return; }
      let rows = getVlsmRows().map(function (x) { return { name: (x.name || '').trim() || 'Unnamed', hosts: Math.floor(Number(x.hosts)) }; });
      const bad = rows.find(function (x) { return !isFinite(x.hosts) || x.hosts < 1; });
      if (bad) { setErr(els.vlsmErr, '"' + bad.name + '": enter a host count of at least 1.'); show(els.vlsmOut, false); last.vlsm = null; return; }
      let note = '';
      if (!isPro() && rows.length > FREE_VLSM_ROWS) { note = ' Free plan: only the first ' + FREE_VLSM_ROWS + ' networks are allocated – upgrade to Pro for unlimited networks.'; rows = rows.slice(0, FREE_VLSM_ROWS); }
      if (!rows.length) { setErr(els.vlsmErr, 'Add at least one network.'); show(els.vlsmOut, false); last.vlsm = null; return; }
      const res = M.vlsm(M.ipv4Info(r.ip, r.prefix).network, r.prefix, rows, els.vlsmP2P.checked);
      last.vlsm = res;
      setErr(els.vlsmErr, (res.error || '') + (res.error && note ? '' : note));
      show(els.vlsmOut, true);
      els.vlsmBody.innerHTML = res.rows.map(function (s) {
        return '<tr><td class="name">' + esc(s.name) + '</td><td class="num">' + fmtNum(s.needed) + '</td><td class="num">' + fmtNum(s.size) + ' (/' + s.prefix + ')</td><td>' + s.cidr + '</td><td>' + s.mask + '</td><td>' + s.first + ' – ' + s.last + '</td><td>' + s.broadcast + '</td><td class="num">' + fmtNum(s.wasted) + '</td></tr>';
      }).join('') || '<tr><td colspan="8" class="name">No subnets allocated.</td></tr>';
      els.vlsmSummary.innerHTML =
        '<div class="stat"><div class="k">Addresses used</div><div class="v">' + fmtNum(res.used) + ' / ' + fmtNum(res.base.total) + '</div></div>' +
        '<div class="stat"><div class="k">Remaining</div><div class="v">' + fmtNum(res.remaining) + (res.nextFree ? ' <small style="color:var(--muted)">from ' + res.nextFree + '</small>' : '') + '</div></div>' +
        '<div class="stat"><div class="k">Efficiency (needed ÷ allocated)</div><div class="v ' + (res.efficiency >= 50 ? 'ok' : '') + '">' + res.efficiency + '%</div></div>';
      if (els.vlsmReportMeta) els.vlsmReportMeta.textContent = 'Base network ' + res.base.cidr + ' · ' + res.rows.length + ' subnets · ' + fmtNum(res.used) + ' of ' + fmtNum(res.base.total) + ' addresses used';
      lastText.vlsm = 'SubnetKit – VLSM plan for ' + res.base.cidr + '\n' + tableToText(els.vlsmTable) + '\nUsed: ' + fmtNum(res.used) + ' · Remaining: ' + fmtNum(res.remaining) + ' · Efficiency: ' + res.efficiency + '%' + (res.error ? '\nERROR: ' + res.error : '');
      track('vlsm_calc', { rows: rows.length });
    } catch (e) { setErr(els.vlsmErr, 'Could not calculate: ' + e.message); }
  }

  /* ---------------- IPv6 tab ---------------- */
  function calcIp6() {
    try {
      const r = M.parseIPv6(els.ip6Addr.value);
      if (r.error) { setErr(els.ip6Err, r.error); show(els.ip6Results, false); show(els.ip6SplitOut, false); last.ipv6 = null; return; }
      setErr(els.ip6Err, ''); show(els.ip6Results, true);
      const info = M.ipv6Info(r.addr, r.prefix);
      last.ipv6 = info;
      els.ip6Grid.innerHTML = kvHtml([
        { k: 'Compressed', v: info.compressed, wide: true },
        { k: 'Expanded', v: info.expanded, wide: true },
        { k: 'Network', v: info.cidr },
        { k: 'Prefix length', v: '/' + info.prefix + ' (' + info.prefix + ' network bits, ' + (128 - info.prefix) + ' host bits)', copy: false },
        { k: 'First address', v: info.firstStr },
        { k: 'Last address', v: info.lastStr },
        { k: 'Total addresses', v: info.totalStr + ' (' + info.totalPow + ')', wide: true, copy: false },
        { k: 'Address type', v: info.type, plain: true, copy: false },
        { k: 'Last address (expanded)', v: info.lastExpanded },
        { k: 'Reverse DNS (ip6.arpa)', v: info.rdns, wide: true }
      ]);
      els.ip6Bin.innerHTML = binLine('Address', info.bin64, Math.min(64, info.prefix), 16) +
        '<div class="legend"><span><i></i>Network bits (' + Math.min(64, info.prefix) + ' of first 64)</span><span>Host / subnet bits</span></div>';
      if (els.ip6ReportMeta) els.ip6ReportMeta.textContent = 'Split of ' + info.cidr;
      baseText.ipv6 = lastText.ipv6 = [
        'SubnetKit – IPv6 ' + info.compressed + '/' + info.prefix,
        'Expanded: ' + info.expanded, 'Network: ' + info.cidr, 'First: ' + info.firstStr, 'Last: ' + info.lastStr,
        'Total addresses: ' + info.totalStr + ' (' + info.totalPow + ')', 'Type: ' + info.type, 'Reverse DNS: ' + info.rdns
      ].join('\n');
      calcIp6Split();
      track('calculate', { tab: 'ipv6' });
    } catch (e) { setErr(els.ip6Err, 'Could not calculate: ' + e.message); }
  }
  function calcIp6Split() {
    const info = last.ipv6;
    if (!info) { show(els.ip6SplitOut, false); return; }
    const newP = Math.floor(Number(els.ip6SplitPrefix.value));
    if (!isFinite(newP)) { setErr(els.ip6SplitErr, 'Enter a prefix length.'); show(els.ip6SplitOut, false); return; }
    const r = M.splitIPv6(info.network, info.prefix, newP, FREE_SPLIT_ROWS);
    if (r.error) { setErr(els.ip6SplitErr, r.error); show(els.ip6SplitOut, false); els.ip6SplitInfo.textContent = ''; return; }
    setErr(els.ip6SplitErr, ''); show(els.ip6SplitOut, true);
    els.ip6SplitInfo.textContent = r.countStr + ' subnets of /' + newP + ' (2^' + (newP - info.prefix) + ')';
    els.ip6SplitBody.innerHTML = r.rows.map(function (s) {
      return '<tr><td class="num">' + s.index + '</td><td>' + s.cidr + '</td><td>' + s.first + '</td><td>' + s.last + '</td></tr>';
    }).join('');
    els.ip6SplitNote.textContent = r.truncated ? 'Showing the first ' + FREE_SPLIT_ROWS + ' of ' + r.countStr + ' subnets.' : '';
    lastText.ipv6 = baseText.ipv6 + '\n\nSplit into /' + newP + ' (' + r.countStr + ' subnets)\n' + tableToText(els.ip6SplitTable);
  }

  /* ---------------- CIDR ↔ Range tab ---------------- */
  function calcCidrTab() {
    const parts = [];
    // (a) CIDR → range
    try {
      const r = M.parseIPv4(els.cidrIn.value, 32);
      if (r.error) { setErr(els.cidrErr, r.error); els.cidrGrid.innerHTML = ''; }
      else {
        setErr(els.cidrErr, '');
        const info = M.ipv4Info(r.ip, r.prefix);
        els.cidrGrid.innerHTML = kvHtml([
          { k: 'Network', v: info.cidr },
          { k: 'Subnet mask', v: info.maskStr },
          { k: 'First IP', v: info.networkStr },
          { k: 'Last IP', v: info.broadcastStr },
          { k: 'Address count', v: fmtNum(info.total), copy: false },
          { k: 'Usable hosts', v: fmtNum(info.usable) + ' (' + info.firstStr + ' – ' + info.lastStr + ')', copy: false }
        ]);
        parts.push('CIDR ' + info.cidr + ' → ' + info.networkStr + ' – ' + info.broadcastStr + ' (' + fmtNum(info.total) + ' addresses, ' + fmtNum(info.usable) + ' usable)');
      }
    } catch (e) { setErr(els.cidrErr, 'Could not calculate: ' + e.message); }
    // (b) Range → CIDR
    try {
      const s = M.ip4ToInt(els.rangeStart.value), e = M.ip4ToInt(els.rangeEnd.value);
      if (s === null || e === null) { setErr(els.rangeErr, 'Enter two valid IPv4 addresses.'); show(els.rangeOut, false); }
      else if (s > e) { setErr(els.rangeErr, 'Start IP must be lower than or equal to the end IP.'); show(els.rangeOut, false); }
      else {
        setErr(els.rangeErr, ''); show(els.rangeOut, true);
        const list = M.rangeToCidr(s, e);
        els.rangeInfo.textContent = fmtNum(e - s + 1) + ' addresses → ' + list.length + ' CIDR block' + (list.length === 1 ? '' : 's');
        els.rangeList.innerHTML = list.map(function (c) { return '<span>' + M.cidrString(c) + '</span>'; }).join('');
        els.rangeBody.innerHTML = list.map(function (c, i) {
          const info = M.ipv4Info(c.network, c.prefix);
          return '<tr><td class="num">' + (i + 1) + '</td><td>' + info.cidr + '</td><td>' + info.maskStr + '</td><td>' + info.networkStr + '</td><td>' + info.broadcastStr + '</td><td class="num">' + fmtNum(info.total) + '</td></tr>';
        }).join('');
        parts.push('Range ' + M.intToIp4(s) + ' – ' + M.intToIp4(e) + ' → ' + list.map(M.cidrString).join(', '));
      }
    } catch (e) { setErr(els.rangeErr, 'Could not calculate: ' + e.message); }
    // (c) Is IP in subnet
    try {
      const ip = M.ip4ToInt(els.chkIp.value);
      const r = M.parseIPv4(els.chkCidr.value, 32);
      if (ip === null) { setErr(els.chkErr, 'Enter a valid IPv4 address to check.'); els.chkOut.innerHTML = ''; }
      else if (r.error) { setErr(els.chkErr, r.error); els.chkOut.innerHTML = ''; }
      else {
        setErr(els.chkErr, '');
        const info = M.ipv4Info(r.ip, r.prefix);
        const inside = ((ip & info.mask) >>> 0) === info.network;
        const ipInfo = M.ipv4Info(ip, r.prefix);
        els.chkOut.innerHTML = (inside ? '<span class="ok">✔ Yes</span>' : '<span class="bad">✘ No</span>') + ' – <code>' + esc(M.intToIp4(ip)) + '</code> ' + (inside ? 'is' : 'is not') + ' inside <code>' + info.cidr + '</code>. ' +
          'Applying mask <code>' + info.maskStr + '</code> to the IP gives network <code>' + ipInfo.networkStr + '</code>' + (inside ? ', which matches.' : ', not ' + info.networkStr + '. ') +
          (inside ? ' The subnet spans ' + info.networkStr + ' – ' + info.broadcastStr + '.' : 'The subnet spans ' + info.networkStr + ' – ' + info.broadcastStr + '.');
        parts.push('Is ' + M.intToIp4(ip) + ' in ' + info.cidr + '? ' + (inside ? 'Yes' : 'No'));
      }
    } catch (e) { setErr(els.chkErr, 'Could not check: ' + e.message); }
    lastText.cidr = 'SubnetKit – CIDR ↔ Range\n' + parts.join('\n');
  }
  function fillRefTable() {
    els.refBody.innerHTML = M.prefixTable().map(function (r) {
      return '<tr><td>/' + r.prefix + '</td><td>' + r.mask + '</td><td>' + r.wildcard + '</td><td class="num">' + fmtNum(r.total) + '</td><td class="num">' + fmtNum(r.usable) + '</td></tr>';
    }).join('');
  }

  /* ---------------- Supernet tab (Pro) ---------------- */
  function runSupernet() {
    if (!isPro()) { openPro('supernet'); return; }
    try {
      const parsed = M.parseCidrList(els.snInput.value);
      if (!parsed.blocks.length) { setErr(els.snErr, 'Enter at least one CIDR block, e.g. 192.168.0.0/24.'); show(els.snOut, false); return; }
      const agg = M.aggregate(parsed.blocks);
      last.supernet = agg;
      setErr(els.snErr, parsed.errors.length ? 'Ignored invalid entries: ' + parsed.errors.join(', ') : '');
      show(els.snOut, true);
      const inAddrs = parsed.blocks.reduce(function (a, b) { return a + M.blockSize(b.prefix); }, 0);
      const outAddrs = agg.reduce(function (a, b) { return a + M.blockSize(b.prefix); }, 0);
      els.snSummary.innerHTML =
        '<div class="stat"><div class="k">Input blocks</div><div class="v">' + parsed.blocks.length + '</div></div>' +
        '<div class="stat"><div class="k">Aggregated blocks</div><div class="v ok">' + agg.length + '</div></div>' +
        '<div class="stat"><div class="k">Addresses covered</div><div class="v">' + fmtNum(outAddrs) + (inAddrs !== outAddrs ? ' <small style="color:var(--muted)">(' + fmtNum(inAddrs - outAddrs) + ' overlapping removed)</small>' : '') + '</div></div>';
      els.snBody.innerHTML = agg.map(function (b, i) {
        const info = M.ipv4Info(b.network, b.prefix);
        return '<tr><td class="num">' + (i + 1) + '</td><td>' + info.cidr + '</td><td>' + info.maskStr + '</td><td>' + info.networkStr + '</td><td>' + info.broadcastStr + '</td><td class="num">' + fmtNum(info.total) + '</td><td class="name">' + esc(b.covers.join(', ')) + '</td></tr>';
      }).join('');
      lastText.supernet = 'SubnetKit – Route summarization\n' + agg.map(function (b) { return b.cidr + '  (covers ' + b.covers.join(', ') + ')'; }).join('\n');
      track('supernet_run', { blocks: parsed.blocks.length });
      toast(parsed.blocks.length + ' blocks → ' + agg.length + ' aggregate' + (agg.length === 1 ? '' : 's'));
    } catch (e) { setErr(els.snErr, 'Could not summarize: ' + e.message); }
  }

  /* ---------------- tables: CSV / text / print ---------------- */
  function tableRows(table) {
    return Array.prototype.map.call(table.querySelectorAll('tr'), function (tr) {
      return Array.prototype.map.call(tr.querySelectorAll('th,td'), function (c) { return c.textContent.trim(); });
    });
  }
  function tableToCsv(table) {
    return tableRows(table).map(function (r) { return r.map(function (v) { return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
  }
  function tableToText(table) {
    const rows = tableRows(table);
    if (!rows.length) return '';
    const w = rows[0].map(function (_, i) { return Math.max.apply(null, rows.map(function (r) { return (r[i] || '').length; })); });
    return rows.map(function (r) { return r.map(function (v, i) { return (v || '').padEnd(w[i]); }).join('  ').trimEnd(); }).join('\n');
  }
  function downloadCsv(table, name) {
    const blob = new Blob(['﻿' + tableToCsv(table)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function printPlan(tableId) {
    const panel = $(tableId).closest('.panel');
    document.querySelectorAll('[data-report-date]').forEach(function (el) { el.textContent = new Date().toLocaleString(); });
    document.body.classList.add('print-mode');
    els.toolCard.classList.add('printing');
    panel.classList.add('printing');
    const cleanup = function () { document.body.classList.remove('print-mode'); els.toolCard.classList.remove('printing'); panel.classList.remove('printing'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    setTimeout(function () { window.print(); setTimeout(cleanup, 1500); }, 50);
  }
  function onTableAction(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const wrap = btn.closest('.table-actions');
    const table = $(wrap.dataset.table);
    if (!table) return;
    const act = btn.dataset.act;
    if (act === 'copy') copyText(tableToCsv(table), 'Table copied as CSV');
    else if (act === 'copy-text') copyText(tableToText(table), 'Table copied as text');
    else if (act === 'download') {
      if (!isPro()) { openPro('csv'); return; }
      downloadCsv(table, 'subnetkit-' + wrap.dataset.table.replace(/Table$/, '').toLowerCase());
      track('download', { table: wrap.dataset.table }); toast('CSV downloaded');
    } else if (act === 'print') {
      if (!isPro()) { openPro('report'); return; }
      track('print', { table: wrap.dataset.table });
      printPlan(wrap.dataset.table);
    }
  }

  /* ---------------- projects (Pro: unlimited, free: 1) ---------------- */
  function loadProjects() { try { return JSON.parse(localStorage.getItem(LS_PROJECTS) || '[]') || []; } catch (e) { return []; } }
  function saveProjects(list) { try { localStorage.setItem(LS_PROJECTS, JSON.stringify(list)); } catch (e) { toast('Could not save project (storage full?)'); } }
  function renderProjects() {
    const list = loadProjects();
    els.projectList.innerHTML = list.length ? list.map(function (p, i) {
      return '<div class="proj"><span class="nm" title="' + esc(p.name) + '">' + esc(p.name) + '</span><span class="dt">' + esc(new Date(p.created).toLocaleDateString()) + '</span>' +
        '<button class="btn" type="button" data-load="' + i + '">Load</button><button class="btn btn-danger" type="button" data-del="' + i + '" aria-label="Delete ' + esc(p.name) + '">✕</button></div>';
    }).join('') : '<p class="hint" style="margin:0">No saved projects yet.</p>';
  }
  function saveProject() {
    const list = loadProjects();
    const name = (els.projectName.value || '').trim() || 'Project ' + (list.length + 1);
    const existing = list.findIndex(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
    if (existing < 0 && !isPro() && list.length >= FREE_PROJECTS) { openPro('projects'); return; }
    const entry = { name: name, created: Date.now(), data: collectState() };
    if (existing >= 0) list[existing] = entry; else list.push(entry);
    saveProjects(list); renderProjects();
    els.projectName.value = '';
    toast(existing >= 0 ? 'Project updated' : 'Project saved');
    track('project_save', { count: list.length });
  }
  function onProjectClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const list = loadProjects();
    if (b.dataset.load !== undefined) {
      const p = list[Number(b.dataset.load)];
      if (!p) return;
      applyState(p.data);
      recalcAll();
      if (p.data.tab) setTab(p.data.tab);
      saveState();
      toast('Loaded "' + p.name + '"');
      window.scrollTo({ top: els.toolCard.offsetTop - 70, behavior: 'smooth' });
    } else if (b.dataset.del !== undefined) {
      const p = list[Number(b.dataset.del)];
      if (!p || !confirm('Delete project "' + p.name + '"?')) return;
      list.splice(Number(b.dataset.del), 1);
      saveProjects(list); renderProjects(); toast('Project deleted');
    }
  }

  /* ---------------- share link ---------------- */
  const SHARE_FIELDS = {
    ipv4: ['ip4Addr', 'ip4Prefix', 'ip4SplitMode', 'ip4SplitPrefix', 'ip4SplitCount'],
    vlsm: ['vlsmBase', 'vlsmP2P'],
    ipv6: ['ip6Addr', 'ip6SplitPrefix'],
    cidr: ['cidrIn', 'rangeStart', 'rangeEnd', 'chkIp', 'chkCidr'],
    supernet: ['snInput']
  };
  function buildShareUrl() {
    const q = new URLSearchParams();
    q.set('tab', activeTab);
    SHARE_FIELDS[activeTab].forEach(function (id) { const el = $(id); q.set(id, el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value); });
    if (activeTab === 'vlsm') q.set('rows', getVlsmRows().map(function (r) { return r.name.replace(/[:,]/g, ' ') + ':' + r.hosts; }).join(','));
    return location.origin + location.pathname + '?' + q.toString() + '#' + activeTab;
  }
  function readShareUrl() {
    const q = new URLSearchParams(location.search);
    const tab = q.get('tab');
    if (!tab || TABS.indexOf(tab) < 0) return null;
    syncing = true;
    SHARE_FIELDS[tab].forEach(function (id) {
      if (!q.has(id)) return;
      const el = $(id);
      if (el.type === 'checkbox') el.checked = q.get(id) === '1'; else el.value = q.get(id);
    });
    if (tab === 'ipv4' && q.has('ip4Prefix')) els.ip4Mask.value = M.intToIp4(M.prefixToMask(Number(q.get('ip4Prefix')) || 0));
    if (tab === 'vlsm' && q.get('rows')) {
      const rows = q.get('rows').split(',').map(function (s) { const i = s.lastIndexOf(':'); return { name: s.slice(0, i), hosts: s.slice(i + 1) }; }).filter(function (r) { return r.name; });
      if (rows.length) renderVlsmRows(rows);
    }
    syncing = false;
    history.replaceState(null, '', location.pathname + '#' + tab);
    return tab;
  }

  /* ---------------- reset / recalc ---------------- */
  function resetTab() {
    syncing = true;
    SHARE_FIELDS[activeTab].forEach(function (id) { const el = $(id); if (el.type === 'checkbox') el.checked = !!DEFAULTS[id]; else el.value = DEFAULTS[id]; });
    if (activeTab === 'ipv4') { els.ip4Mask.value = DEFAULTS.ip4Mask; els.ip4Free.value = ''; }
    if (activeTab === 'vlsm') renderVlsmRows(DEFAULT_VLSM.map(function (r) { return { name: r[0], hosts: r[1] }; }));
    if (activeTab === 'supernet') { show(els.snOut, false); setErr(els.snErr, ''); }
    syncing = false;
    recalcAll(); saveState(); toast('Tab reset');
  }
  function recalcAll() { calcIp4(); calcVlsm(); calcIp6(); calcCidrTab(); }
  function refreshUI() {
    const pro = isPro();
    document.querySelectorAll('[data-pro-lock]').forEach(function (el) { el.classList.toggle('hidden', pro); });
    updateVlsmHint();
    calcIp4Split(); calcVlsm();
  }

  /* ---------------- init ---------------- */
  function init() {
    ['toolCard', 'tabBar', 'ip4Addr', 'ip4Prefix', 'ip4Mask', 'ip4Free', 'ip4Err', 'ip4Results', 'ip4Grid', 'ip4Bin', 'ip4ReportMeta',
      'ip4SplitMode', 'ip4SplitPrefix', 'ip4SplitPrefixWrap', 'ip4SplitCount', 'ip4SplitCountWrap', 'ip4SplitErr', 'ip4SplitOut', 'ip4SplitTable', 'ip4SplitBody', 'ip4SplitNote',
      'vlsmBase', 'vlsmP2P', 'vlsmRows', 'btnVlsmAdd', 'vlsmLimitHint', 'vlsmErr', 'vlsmOut', 'vlsmTable', 'vlsmBody', 'vlsmSummary', 'vlsmReportMeta',
      'ip6Addr', 'ip6Err', 'ip6Results', 'ip6Grid', 'ip6Bin', 'ip6ReportMeta', 'ip6SplitPrefix', 'ip6SplitInfo', 'ip6SplitErr', 'ip6SplitOut', 'ip6SplitTable', 'ip6SplitBody', 'ip6SplitNote',
      'cidrIn', 'cidrErr', 'cidrGrid', 'rangeStart', 'rangeEnd', 'rangeErr', 'rangeOut', 'rangeInfo', 'rangeList', 'rangeTable', 'rangeBody', 'chkIp', 'chkCidr', 'chkErr', 'chkOut', 'refBody',
      'snInput', 'btnSnRun', 'btnSnClear', 'snErr', 'snOut', 'snSummary', 'snTable', 'snBody',
      'btnCopyResults', 'btnShare', 'btnReset', 'projectName', 'btnSaveProject', 'projectList', 'courseCard', 'courseText', 'courseLink', 'proPrice'
    ].forEach(function (id) { els[id] = $(id); });

    // price + app name
    if (els.proPrice) els.proPrice.textContent = C.PRO_PRICE || '$12';
    document.querySelectorAll('[data-pro-price]').forEach(function (el) { el.textContent = C.PRO_PRICE || '$12'; });
    document.querySelectorAll('[data-app-name]').forEach(function (el) { el.textContent = C.APP_NAME || 'SubnetKit'; });

    // course card
    const course = (C.AFFILIATE_LINKS || {}).course;
    if (course && course.url) {
      els.courseLink.href = course.url;
      if (course.name) els.courseLink.textContent = course.name + ' →';
      els.courseLink.addEventListener('click', function () { track('affiliate_click', { name: course.name || 'course' }); });
      show(els.courseCard, true);
    }

    fillIp4Selects();
    els.ip4Prefix.value = DEFAULTS.ip4Prefix; els.ip4Mask.value = DEFAULTS.ip4Mask; els.ip4SplitCount.value = DEFAULTS.ip4SplitCount;
    fillRefTable();
    renderVlsmRows(DEFAULT_VLSM.map(function (r) { return { name: r[0], hosts: r[1] }; }));

    // restore state → URL params override
    const saved = loadState();
    if (saved) applyState(saved);
    const urlTab = readShareUrl();
    const hashTab = (location.hash || '').replace('#', '');
    setTab(urlTab || (TABS.indexOf(hashTab) >= 0 ? hashTab : (saved && saved.tab) || 'ipv4'), false);
    if (!location.hash) history.replaceState(null, '', '#' + activeTab);

    // IPv4 sync between prefix / mask / free text
    els.ip4Prefix.addEventListener('change', function () { if (syncing) return; syncing = true; els.ip4Mask.value = M.intToIp4(M.prefixToMask(Number(els.ip4Prefix.value))); els.ip4Free.value = ''; syncing = false; });
    els.ip4Mask.addEventListener('change', function () { if (syncing) return; syncing = true; els.ip4Prefix.value = String(M.maskToPrefix(els.ip4Mask.value)); els.ip4Free.value = ''; syncing = false; });
    els.ip4Free.addEventListener('input', onIp4Free);
    ['ip4Addr', 'ip4Prefix', 'ip4Mask'].forEach(function (id) { els[id].addEventListener('input', function () { if (!syncing) calcIp4(); }); els[id].addEventListener('change', function () { if (!syncing) calcIp4(); }); });
    ['ip4SplitMode', 'ip4SplitPrefix', 'ip4SplitCount'].forEach(function (id) { els[id].addEventListener('change', calcIp4Split); });

    // VLSM
    els.btnVlsmAdd.addEventListener('click', addVlsmRow);
    els.vlsmRows.addEventListener('input', function () { if (!syncing) calcVlsm(); });
    els.vlsmRows.addEventListener('click', function (e) {
      const b = e.target.closest('button[data-rm]'); if (!b) return;
      const rows = getVlsmRows(); rows.splice(Number(b.dataset.rm), 1); renderVlsmRows(rows); saveState(); calcVlsm();
    });
    els.vlsmBase.addEventListener('input', calcVlsm);
    els.vlsmP2P.addEventListener('change', calcVlsm);

    // IPv6
    els.ip6Addr.addEventListener('input', calcIp6);
    els.ip6SplitPrefix.addEventListener('input', calcIp6Split);

    // CIDR tab
    ['cidrIn', 'rangeStart', 'rangeEnd', 'chkIp', 'chkCidr'].forEach(function (id) { els[id].addEventListener('input', calcCidrTab); });

    // Supernet
    els.btnSnRun.addEventListener('click', runSupernet);
    els.btnSnClear.addEventListener('click', function () { els.snInput.value = ''; show(els.snOut, false); setErr(els.snErr, ''); saveState(); els.snInput.focus(); });

    // tabs
    els.tabBar.addEventListener('click', function (e) { const b = e.target.closest('.tab'); if (b) setTab(b.dataset.tab); });
    els.tabBar.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.indexOf(activeTab); const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      setTab(TABS[n]); $('tab-' + TABS[n]).focus(); e.preventDefault();
    });
    window.addEventListener('hashchange', function () { const h = location.hash.replace('#', ''); if (TABS.indexOf(h) >= 0 && h !== activeTab) setTab(h, false); });

    // global actions
    els.btnCopyResults.addEventListener('click', function () {
      const t = lastText[activeTab];
      if (!t) { toast(activeTab === 'supernet' ? 'Run the summarization first' : 'Nothing to copy – fix the input first'); return; }
      copyText(t, 'Results copied');
    });
    els.btnShare.addEventListener('click', function () { copyText(buildShareUrl(), 'Share link copied'); track('share', { tab: activeTab }); });
    els.btnReset.addEventListener('click', resetTab);
    els.btnSaveProject.addEventListener('click', saveProject);
    els.projectName.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveProject(); });
    els.projectList.addEventListener('click', onProjectClick);
    els.toolCard.addEventListener('click', function (e) {
      onTableAction(e);
      const c = e.target.closest('button[data-copy]'); if (c) copyText(c.dataset.copy, 'Copied ' + c.dataset.copy);
    });
    // persistence
    els.toolCard.addEventListener('input', function () { if (!syncing) saveState(); });
    els.toolCard.addEventListener('change', function () { if (!syncing) saveState(); });

    document.addEventListener('pro:changed', refreshUI);
    refreshUI();
    renderProjects();
    recalcAll();
    saveState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
