(function () {
  'use strict';

  var D = window.PUBG_DATA;
  var TILE_MAX = D.tileMax || 4;
  var MAX_ZOOM = TILE_MAX + 1;      // 允许再放大一档（像素插值）
  var MIN_ZOOM = 1;
  var TILE_PX = 256;

  var canvas = document.getElementById('map');
  var ctx = canvas.getContext('2d', { alpha: false });
  var W = 0, H = 0, DPR = 1;

  // ---------- state ----------
  var LS = {
    map: 'pubg_off_map', zoom: 'pubg_off_zoom', grid: 'pubg_off_grid',
    enabled: function (m) { return 'pubg_off_types_' + m; }
  };

  var state = {
    mapKey: D.maps[0].key,
    zoom: 2,
    cx: 0.5,
    cy: 0.5,
    grid: false,
    mode: 'browse',           // browse | measure
    enabled: {},              // {mapKey: {typeKey:true}}
    measure: [],              // [{x,y}] normalized
    elev: 0,
    dragIdx: -1,
    popup: null
  };

  try {
    var savedMap = localStorage.getItem(LS.map);
    if (savedMap && D.maps.some(function (m) { return m.key === savedMap; })) state.mapKey = savedMap;
    var sz = parseFloat(localStorage.getItem(LS.zoom));
    if (isFinite(sz)) state.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, sz));
    state.grid = localStorage.getItem(LS.grid) === '1';
  } catch (e) { }

  function mapDef() {
    for (var i = 0; i < D.maps.length; i++) if (D.maps[i].key === state.mapKey) return D.maps[i];
    return D.maps[0];
  }
  function sizeM() { return mapDef().sizeKm * 1000; }

  function loadEnabled() {
    var m = mapDef();
    var obj = {};
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(LS.enabled(m.key)) || 'null'); } catch (e) { }
    m.types.forEach(function (t) {
      obj[t.key] = raw && typeof raw[t.key] === 'boolean' ? raw[t.key] : true;
    });
    state.enabled[m.key] = obj;
  }
  function saveEnabled() {
    try { localStorage.setItem(LS.enabled(state.mapKey), JSON.stringify(state.enabled[state.mapKey])); } catch (e) { }
  }
  function isOn(typeKey) {
    var e = state.enabled[state.mapKey];
    return !!(e && e[typeKey]);
  }
  function pointsOf(typeKey) {
    var p = D.points[state.mapKey];
    return (p && p[typeKey]) || null;
  }

  // ---------- geometry ----------
  function scalePPU() { return TILE_PX * Math.pow(2, state.zoom); }   // px per normalized unit
  function n2sx(nx) { return (nx - state.cx) * scalePPU() + W / 2; }
  function n2sy(ny) { return (ny - state.cy) * scalePPU() + H / 2; }
  function sx2n(sx) { return (sx - W / 2) / scalePPU() + state.cx; }
  function sy2n(sy) { return (sy - H / 2) / scalePPU() + state.cy; }
  function distM(a, b) {
    var s = sizeM();
    var dx = (a.x - b.x) * s, dy = (a.y - b.y) * s;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- tile cache ----------
  var tiles = new Map();
  var tileLoading = 0;

  function tileURL(z, x, y) {
    return 'tiles/' + state.mapKey + '/' + z + '_' + x + '_' + y + '.jpg';
  }
  function getTile(z, x, y) {
    var key = state.mapKey + '/' + z + '_' + x + '_' + y;
    var t = tiles.get(key);
    if (t) return t.ok ? t.img : null;
    t = { img: new Image(), ok: false };
    tiles.set(key, t);
    t.img.onload = function () { t.ok = true; requestDraw(); };
    t.img.onerror = function () { t.ok = false; };
    t.img.src = tileURL(z, x, y);
    if (tiles.size > 900) {
      var first = tiles.keys().next();
      if (!first.done) tiles.delete(first.value);
    }
    return null;
  }

  // ---------- icons ----------
  var icons = {};
  function buildIcons() {
    D.types.forEach(function (t) {
      if (!t.svg) return;
      var img = new Image();
      img.onload = function () { requestDraw(); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t.svg);
      icons[t.key] = img;
    });
  }
  function typeMeta(key) {
    for (var i = 0; i < D.types.length; i++) if (D.types[i].key === key) return D.types[i];
    return { key: key, zh: key, color: '#fff', svg: '' };
  }

  // ---------- draw ----------
  var drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    syncBottomHeight();
    requestDraw();
  }

  function syncBottomHeight() {
    var bar = document.getElementById('bottombar');
    var h = bar ? bar.offsetHeight : 104;
    document.documentElement.style.setProperty('--bbh', h + 'px');
  }

  function draw() {
    ctx.fillStyle = '#0b0e12';
    ctx.fillRect(0, 0, W, H);

    var sc = scalePPU();
    var zl = clamp(Math.floor(state.zoom + 0.001), 1, TILE_MAX);
    var n = Math.pow(2, zl);
    var ts = TILE_PX * Math.pow(2, state.zoom - zl);

    var nx0 = state.cx - (W / 2) / sc, nx1 = state.cx + (W / 2) / sc;
    var ny0 = state.cy - (H / 2) / sc, ny1 = state.cy + (H / 2) / sc;

    var tx0 = Math.max(0, Math.floor(nx0 * n)), tx1 = Math.min(n - 1, Math.ceil(nx1 * n));
    var ty0 = Math.max(0, Math.floor(ny0 * n)), ty1 = Math.min(n - 1, Math.ceil(ny1 * n));

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (var tx = tx0; tx <= tx1; tx++) {
      for (var ty = ty0; ty <= ty1; ty++) {
        var img = getTile(zl, tx, ty);
        var px = (tx / n - state.cx) * sc + W / 2;
        var py = (ty / n - state.cy) * sc + H / 2;
        if (img) {
          ctx.drawImage(img, px, py, ts + 0.6, ts + 0.6);
        } else if (zl > MIN_ZOOM) {
          // 用低一级瓦片兜底
          var pz = zl - 1, pn = n / 2;
          var pi = getTile(pz, Math.floor(tx / 2), Math.floor(ty / 2));
          if (pi) {
            var pxz = (Math.floor(tx / 2) / pn - state.cx) * sc + W / 2;
            var pyz = (Math.floor(ty / 2) / pn - state.cy) * sc + H / 2;
            ctx.drawImage(pi, pxz, pyz, ts * 2 + 0.6, ts * 2 + 0.6);
          }
        }
      }
    }

    if (state.grid) drawGrid(nx0, nx1, ny0, ny1);
    drawMarkers();
    drawMeasure();
    updateScaleBar();
  }

  function drawGrid(nx0, nx1, ny0, ny1) {
    var km = 1 / mapDef().sizeKm;   // 1km 在归一化坐标中的长度
    ctx.save();
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gx = Math.floor(nx0 / km) * km; gx <= nx1; gx += km) {
      var sx = Math.round(n2sx(gx)) + 0.5;
      ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
    }
    for (var gy = Math.floor(ny0 / km) * km; gy <= ny1; gy += km) {
      var sy = Math.round(n2sy(gy)) + 0.5;
      ctx.moveTo(0, sy); ctx.lineTo(W, sy);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.42)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  var LABEL_FONT = '600 11px system-ui, -apple-system, "Noto Sans SC", sans-serif';

  function drawMarkers() {
    var m = mapDef();
    var sc = scalePPU();
    var pad = 30;
    var size = clamp(18 * Math.pow(1.35, state.zoom - 3), 15, 26);   // 随缩放轻微变大
    for (var i = 0; i < m.types.length; i++) {
      var t = m.types[i];
      if (!isOn(t.key)) continue;
      var pts = pointsOf(t.key);
      if (!pts) continue;
      var img = icons[t.key];
      for (var j = 0; j < pts.length; j++) {
        var p = pts[j];
        var sx = (p[0] - state.cx) * sc + W / 2;
        if (sx < -pad || sx > W + pad) continue;
        var sy = (p[1] - state.cy) * sc + H / 2;
        if (sy < -pad || sy > H + pad) continue;
        if (img && img.complete && img.naturalWidth) {
          var h = size * (img.naturalHeight / img.naturalWidth);
          ctx.drawImage(img, sx - size / 2, sy - h, size, h);
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, 4, 0, 6.2832);
          ctx.fillStyle = t.color || '#fff';
          ctx.fill();
        }
      }
    }
  }

  function drawMeasure() {
    var pts = state.measure;
    if (!pts.length) return;
    var screen = pts.map(function (p) { return { x: n2sx(p.x), y: n2sy(p.y) }; });

    // 线
    if (screen.length > 1) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(screen[0].x, screen[0].y);
      for (var i = 1; i < screen.length; i++) ctx.lineTo(screen[i].x, screen[i].y);
      ctx.strokeStyle = 'rgba(6,20,28,.85)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = '#35d0ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // 分段距离
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var k = 1; k < screen.length; k++) {
      var a = screen[k - 1], b = screen[k];
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var d = distM(pts[k - 1], pts[k]);
      var txt = fmtDist(d);
      var wl = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(6,14,20,.82)';
      roundRect(mx - wl / 2 - 5, my - 9, wl + 10, 18, 5);
      ctx.fill();
      ctx.fillStyle = '#eaf6ff';
      ctx.fillText(txt, mx, my);
    }

    // 顶点
    for (var q = 0; q < screen.length; q++) {
      var isFirst = q === 0;
      ctx.beginPath();
      ctx.arc(screen[q].x, screen[q].y, isFirst ? 8 : 6, 0, 6.2832);
      ctx.fillStyle = isFirst ? '#f2b134' : '#35d0ff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isFirst ? '#1b1204' : '#06202b';
      ctx.stroke();
      if (isFirst) {
        ctx.beginPath();
        ctx.arc(screen[q].x, screen[q].y, 3, 0, 6.2832);
        ctx.fillStyle = '#1b1204';
        ctx.fill();
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fmtDist(m) {
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km';
  }

  function updateScaleBar() {
    var sc = scalePPU();
    var target = 70 / sc * sizeM();      // 目标像素 70 对应的米
    var pow = Math.pow(10, Math.floor(Math.log(target) / Math.LN10));
    var cands = [1, 2, 5, 10].map(function (v) { return v * pow; });
    var pick = cands[0];
    for (var i = 0; i < cands.length; i++) if (cands[i] <= target * 1.6) pick = cands[i];
    var px = pick / sizeM() * sc;
    var el = document.getElementById('scalebar');
    el.querySelector('i').style.width = Math.max(24, Math.round(px)) + 'px';
    document.getElementById('scale-label').textContent = pick >= 1000 ? (pick / 1000) + ' km' : Math.round(pick) + ' m';
  }

  function updateReadout() {
    var el = document.getElementById('readout');
    var x = state.cx * sizeM(), y = state.cy * sizeM();
    el.textContent = 'X ' + Math.round(x) + '  Y ' + Math.round(y) + '  ·  ' + mapDef().zh;
  }

  // ---------- 迫击炮 ----------
  function mortarSolution(horizontal, dh) {
    var V = 700;
    if (horizontal <= 0) return null;
    var tanBeta = dh / horizontal;
    var beta = Math.atan(tanBeta) * 180 / Math.PI;
    var delta = V * V - 2 * horizontal * V * tanBeta - horizontal * horizontal;
    var res = { horizontal: horizontal, dh: dh, beta: beta, tanBeta: tanBeta, theta: null, range: null, out: delta < 0 };
    if (delta >= 0) {
      var sq = Math.sqrt(delta);
      res.theta = Math.atan2(V + sq, horizontal) * 180 / Math.PI;
      res.range = (horizontal + tanBeta * (V - sq)) / (tanBeta * tanBeta + 1);
    }
    return res;
  }

  function renderMortar() {
    var out = document.getElementById('mortar-out');
    if (state.measure.length < 2) {
      out.innerHTML = '<div class="hint">先在地图上标两个点（起点 → 目标）</div>';
      return;
    }
    var a = state.measure[0], b = state.measure[state.measure.length - 1];
    var dh = state.elev || 0;
    var sol = mortarSolution(distM(a, b), dh);
    if (!sol) { out.innerHTML = '<div class="hint">两点距离过近</div>'; return; }
    var html = '<div class="mcards">' +
      card('水平距离', Math.round(sol.horizontal) + ' <span style="font-size:11px;opacity:.7">m</span>', '') +
      card('高差', (sol.dh >= 0 ? '+' : '') + Math.round(sol.dh) + ' <span style="font-size:11px;opacity:.7">m</span>', '') +
      card('密位 R', sol.range == null ? '—' : Math.round(sol.range) + ' <span style="font-size:11px;opacity:.7">m</span>', 'hl') +
      card('仰角 θ', sol.theta == null ? '—' : sol.theta.toFixed(1) + '°', 'hl') +
      '</div>';
    if (sol.out) {
      html += '<div class="warn">水平距离已超过 700 m 最大射程，需要向目标接近后再打。</div>';
    } else {
      html += '<p class="fine">把「密位 R」按米数拨到迫击炮标尺上即可；仰角为弹道解算角，仅作校验。</p>';
    }
    out.innerHTML = html;
  }
  function card(label, val, cls) {
    return '<div class="mcard ' + (cls || '') + '"><b>' + val + '</b><span>' + label + '</span></div>';
  }

  // ---------- UI ----------
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 1400);
  }

  function buildChips() {
    var box = document.getElementById('mapchips');
    box.innerHTML = '';
    D.maps.forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'chip' + (m.key === state.mapKey ? ' active' : '');
      b.textContent = m.zh;
      b.onclick = function () { switchMap(m.key); };
      box.appendChild(b);
    });
  }

  function switchMap(key) {
    if (key === state.mapKey) return;
    state.mapKey = key;
    state.cx = 0.5; state.cy = 0.5;
    state.measure = [];
    hidePopup();
    loadEnabled();
    try { localStorage.setItem(LS.map, key); } catch (e) { }
    buildChips();
    renderTypeList();
    updateTypeCount();
    syncMeasureBar();
    updateReadout();
    requestDraw();
  }

  function updateTypeCount() {
    var on = 0, total = 0;
    var m = mapDef();
    m.types.forEach(function (t) {
      var c = (pointsOf(t.key) || []).length;
      total += c;
      if (isOn(t.key)) on += c;
    });
    document.getElementById('type-count').textContent = on + '/' + total;
  }

  function renderTypeList() {
    var box = document.getElementById('type-list');
    var m = mapDef();
    box.innerHTML = '';
    m.types.forEach(function (t) {
      var meta = typeMeta(t.key);
      var pts = pointsOf(t.key) || [];
      var row = document.createElement('div');
      row.className = 'type-row' + (isOn(t.key) ? ' on' : '');
      var sw = document.createElement('div');
      sw.className = 'sw';
      if (meta.svg) sw.style.backgroundImage = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(meta.svg) + '")';
      else sw.style.background = meta.color;
      var nm = document.createElement('div');
      nm.className = 'nm';
      nm.innerHTML = meta.zh + (t.note ? ' <small>' + t.note + '</small>' : '');
      var cnt = document.createElement('div');
      cnt.className = 'cnt';
      cnt.textContent = pts.length;
      var tick = document.createElement('div');
      tick.className = 'tick';
      tick.textContent = '✓';
      row.appendChild(sw); row.appendChild(nm); row.appendChild(cnt); row.appendChild(tick);
      row.onclick = function () {
        state.enabled[state.mapKey][t.key] = !isOn(t.key);
        row.classList.toggle('on', isOn(t.key));
        saveEnabled(); updateTypeCount(); requestDraw();
      };
      box.appendChild(row);
    });
  }

  function applyPreset(kind) {
    var m = mapDef();
    m.types.forEach(function (t) {
      if (kind === 'all') state.enabled[state.mapKey][t.key] = true;
      else if (kind === 'none') state.enabled[state.mapKey][t.key] = false;
      else if (kind === 'key') state.enabled[state.mapKey][t.key] = /secret|vehicles|garage|vault|security/i.test(t.key);
    });
    saveEnabled(); renderTypeList(); updateTypeCount(); requestDraw();
  }

  function openSheet(id) {
    document.querySelectorAll('.sheet').forEach(function (s) { s.classList.remove('open'); });
    document.getElementById(id).classList.add('open');
  }
  function closeSheets() {
    document.querySelectorAll('.sheet').forEach(function (s) { s.classList.remove('open'); });
  }

  function setMode(mode) {
    state.mode = mode;
    var btn = document.getElementById('btn-mode');
    btn.textContent = mode === 'measure' ? '退出测距' : '测距';
    btn.classList.toggle('active', mode === 'measure');
    document.body.classList.toggle('measuring', mode === 'measure');
    document.getElementById('measurebar').classList.toggle('hidden', mode !== 'measure');
    hidePopup();
    syncMeasureBar();
    requestDraw();
  }

  function syncMeasureBar() {
    var pts = state.measure;
    var total = 0;
    for (var i = 1; i < pts.length; i++) total += distM(pts[i - 1], pts[i]);
    document.getElementById('m-total').textContent = total ? Math.round(total) : 0;
    var sub;
    if (pts.length === 0) sub = '点击地图添加测距点';
    else if (pts.length === 1) sub = '再点一个点测距 · 可拖动已有点';
    else {
      var a = pts[0], b = pts[pts.length - 1];
      sub = '直线 ' + Math.round(distM(a, b)) + ' m · 共 ' + pts.length + ' 个点';
    }
    document.getElementById('m-sub').textContent = sub;
    if (document.getElementById('sheet-mortar').classList.contains('open')) renderMortar();
  }

  function addMeasurePoint(nx, ny, silent) {
    state.measure.push({ x: nx, y: ny });
    syncMeasureBar();
    requestDraw();
    if (!silent) {
      var p = state.measure[state.measure.length - 1];
      toast('已标记 X ' + Math.round(p.x * sizeM()) + ' / Y ' + Math.round(p.y * sizeM()));
    }
  }

  function hidePopup() {
    state.popup = null;
    document.getElementById('marker-pop').classList.remove('show');
  }

  function showPopup(pt, typeKey, sx, sy) {
    var meta = typeMeta(typeKey);
    var el = document.getElementById('marker-pop');
    var m = mapDef();
    var tm = null;
    for (var i = 0; i < m.types.length; i++) if (m.types[i].key === typeKey) tm = m.types[i];
    var dist = '';
    if (state.measure.length) {
      var d = distM(state.measure[state.measure.length - 1], pt);
      dist = '距上一个测距点 ' + fmtDist(d);
    }
    el.innerHTML =
      '<div class="pt"><i style="background:' + (meta.color || '#fff') + '"></i>' + meta.zh + '</div>' +
      '<div class="pd">X ' + Math.round(pt.x * sizeM()) + '  Y ' + Math.round(pt.y * sizeM()) +
      (tm && tm.note ? '  ·  ' + tm.note : '') + '</div>' +
      (dist ? '<div class="pd">' + dist + '</div>' : '') +
      '<div class="pa"><button data-act="from">设为测距起点</button><button data-act="to">加为终点</button></div>';
    el.classList.add('show');
    el.querySelector('[data-act="from"]').onclick = function () {
      state.measure = [{ x: pt.x, y: pt.y }];
      setMode('measure'); hidePopup(); requestDraw();
    };
    el.querySelector('[data-act="to"]').onclick = function () {
      if (!state.measure.length) state.measure = [{ x: pt.x, y: pt.y }];
      else state.measure.push({ x: pt.x, y: pt.y });
      setMode('measure'); hidePopup(); syncMeasureBar(); requestDraw();
    };
    state.popup = { pt: pt, key: typeKey };
  }

  // ---------- 手势 ----------
  var pointers = new Map();
  var gesture = null;
  var lastTap = { t: 0, x: 0, y: 0 };

  function localXY(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitMeasurePoint(x, y) {
    for (var i = state.measure.length - 1; i >= 0; i--) {
      var p = state.measure[i];
      var dx = n2sx(p.x) - x, dy = n2sy(p.y) - y;
      if (dx * dx + dy * dy <= 400) return i;
    }
    return -1;
  }

  function hitMarker(x, y) {
    var m = mapDef();
    var best = null, bestD = 24 * 24;
    var sc = scalePPU();
    for (var i = 0; i < m.types.length; i++) {
      var t = m.types[i];
      if (!isOn(t.key)) continue;
      var pts = pointsOf(t.key);
      if (!pts) continue;
      for (var j = 0; j < pts.length; j++) {
        var p = pts[j];
        var dx = (p[0] - state.cx) * sc + W / 2 - x;
        if (dx * dx > bestD) continue;
        var dy = (p[1] - state.cy) * sc + H / 2 - y;
        var d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = { pt: { x: p[0], y: p[1] }, key: t.key }; }
      }
    }
    return best;
  }

  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    var p = localXY(e);
    pointers.set(e.pointerId, p);
    hidePopup();

    if (pointers.size === 1) {
      if (state.mode === 'measure') {
        var idx = hitMeasurePoint(p.x, p.y);
        if (idx >= 0) {
          state.dragIdx = idx;
          gesture = { type: 'drag', moved: false };
          requestDraw();
          return;
        }
      }
      gesture = { type: 'pan', startX: p.x, startY: p.y, cx: state.cx, cy: state.cy, moved: false };
    } else if (pointers.size === 2) {
      var arr = Array.from(pointers.values());
      var mx = (arr[0].x + arr[1].x) / 2, my = (arr[0].y + arr[1].y) / 2;
      gesture = {
        type: 'pinch',
        d0: Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y),
        z0: state.zoom,
        mid: { x: mx, y: my },
        anchor: { x: sx2n(mx), y: sy2n(my) }
      };
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    var p = localXY(e);
    pointers.set(e.pointerId, p);

    if (!gesture) return;

    if (gesture.type === 'drag' && state.dragIdx >= 0) {
      var nx = clamp(sx2n(p.x), 0, 1), ny = clamp(sy2n(p.y), 0, 1);
      state.measure[state.dragIdx] = { x: nx, y: ny };
      syncMeasureBar();
      requestDraw();
      return;
    }

    if (gesture.type === 'pan' && pointers.size === 1) {
      var dx = p.x - gesture.startX, dy = p.y - gesture.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) gesture.moved = true;
      state.cx = gesture.cx - dx / scalePPU();
      state.cy = gesture.cy - dy / scalePPU();
      updateReadout();
      requestDraw();
      return;
    }

    if (gesture.type === 'pinch' && pointers.size >= 2) {
      var arr = Array.from(pointers.values());
      var d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
      if (gesture.d0 > 0) {
        var z = clamp(gesture.z0 + Math.log2(d / gesture.d0), MIN_ZOOM, MAX_ZOOM);
        state.zoom = z;
        // 保持捏合中心不动
        var sc = scalePPU();
        state.cx = gesture.anchor.x - (gesture.mid.x - W / 2) / sc;
        state.cy = gesture.anchor.y - (gesture.mid.y - H / 2) / sc;
        clampCam();
        updateReadout();
        requestDraw();
      }
      return;
    }
  });

  function endPointer(e) {
    var p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (gesture && gesture.type === 'drag' && state.dragIdx >= 0) {
      state.dragIdx = -1;
      gesture = null;
      return;
    }
    if (pointers.size === 0) {
      var g = gesture;
      gesture = null;
      if (!p) return;
      if (g && g.type === 'pan' && !g.moved) handleTap(p.x, p.y);
      else if (g && g.type === 'pinch') { saveZoom(); }
    }
    if (pointers.size === 1) {
      // 从捏合退化为单指拖动
      var rest = Array.from(pointers.values())[0];
      gesture = { type: 'pan', startX: rest.x, startY: rest.y, cx: state.cx, cy: state.cy, moved: true };
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  function clampCam() {
    state.zoom = clamp(state.zoom, MIN_ZOOM, MAX_ZOOM);
    var sc = scalePPU();
    var halfW = (W / 2) / sc, halfH = (H / 2) / sc;
    var minX = Math.min(halfW, 0.5), maxX = Math.max(1 - halfW, 0.5);
    var minY = Math.min(halfH, 0.5), maxY = Math.max(1 - halfH, 0.5);
    state.cx = clamp(state.cx, minX, maxX);
    state.cy = clamp(state.cy, minY, maxY);
    saveZoom();
  }

  function saveZoom() {
    try { localStorage.setItem(LS.zoom, state.zoom.toFixed(3)); } catch (e) { }
  }

  function handleTap(x, y) {
    var now = Date.now();
    // 双击放大（浏览模式下）
    if (state.mode === 'browse' && now - lastTap.t < 280 && Math.hypot(x - lastTap.x, y - lastTap.y) < 28) {
      lastTap.t = 0;
      zoomAt(x, y, 1);
      return;
    }
    lastTap = { t: now, x: x, y: y };

    if (state.mode === 'measure') {
      addMeasurePoint(clamp(sx2n(x), 0, 1), clamp(sy2n(y), 0, 1));
      return;
    }
    var hit = hitMarker(x, y);
    if (hit) showPopup(hit.pt, hit.key, x, y);
    else hidePopup();
  }

  function zoomAt(x, y, factor) {
    var before = { x: sx2n(x), y: sy2n(y) };
    state.zoom = clamp(state.zoom + factor, MIN_ZOOM, MAX_ZOOM);
    var sc = scalePPU();
    state.cx = before.x - (x - W / 2) / sc;
    state.cy = before.y - (y - H / 2) / sc;
    clampCam();
    updateReadout();
    requestDraw();
  }

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var p = localXY(e);
    zoomAt(p.x, p.y, e.deltaY < 0 ? 0.25 : -0.25);
  }, { passive: false });

  // ---------- 事件绑定 ----------
  document.getElementById('btn-zoom-in').onclick = function () { zoomAt(W / 2, H / 2, 0.5); };
  document.getElementById('btn-zoom-out').onclick = function () { zoomAt(W / 2, H / 2, -0.5); };
  document.getElementById('btn-reset').onclick = function () {
    state.cx = 0.5; state.cy = 0.5; state.zoom = Math.min(2, MAX_ZOOM);
    clampCam(); updateReadout(); requestDraw();
  };
  document.getElementById('btn-grid').onclick = function () {
    state.grid = !state.grid;
    this.classList.toggle('on', state.grid);
    try { localStorage.setItem(LS.grid, state.grid ? '1' : '0'); } catch (e) { }
    requestDraw();
  };
  document.getElementById('btn-mode').onclick = function () {
    setMode(state.mode === 'measure' ? 'browse' : 'measure');
  };
  document.getElementById('btn-types').onclick = function () { renderTypeList(); openSheet('sheet-types'); };
  document.getElementById('btn-about').onclick = function () { openSheet('sheet-about'); };
  document.querySelectorAll('.sheet-close').forEach(function (b) {
    b.onclick = closeSheets;
  });
  document.querySelectorAll('.sheet-quick button').forEach(function (b) {
    b.onclick = function () { applyPreset(b.getAttribute('data-preset')); };
  });
  document.getElementById('m-undo').onclick = function () {
    state.measure.pop(); syncMeasureBar(); requestDraw();
  };
  document.getElementById('m-clear').onclick = function () {
    state.measure = []; syncMeasureBar(); requestDraw();
  };
  document.getElementById('m-mortar').onclick = function () {
    renderMortar(); openSheet('sheet-mortar');
  };
  document.getElementById('elev').oninput = function () {
    state.elev = parseFloat(this.value) || 0;
    renderMortar();
  };
  document.querySelectorAll('.elev-quick button').forEach(function (b) {
    b.onclick = function () {
      var v = parseFloat(b.getAttribute('data-elev')) || 0;
      state.elev = v;
      document.getElementById('elev').value = v;
      renderMortar();
    };
  });
  document.getElementById('data-ver').textContent = D.version || '';

  window.addEventListener('resize', function () { resize(); clampCam(); requestDraw(); });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { resize(); clampCam(); requestDraw(); }, 250);
  });

  // 阻止 WebView 默认的长按选择/回弹
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  // ---------- init ----------
  buildIcons();
  loadEnabled();
  buildChips();
  updateTypeCount();
  setMode('browse');
  resize();
  clampCam();
  updateReadout();
  updateScaleBar();
  requestDraw();

  window.__app = { state: state, draw: draw, sync: syncMeasureBar, mode: setMode };   // 便于调试/截图校验
})();
