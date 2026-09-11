/*
 * LumEdit ↔ camera-watermark 嵌入桥
 * 作用：把完整的 camera-watermark 编辑器作为 LumEdit 的「水印工作室」子窗口加载，
 * 不重写其任何水印能力；本脚本只负责：进入嵌入版式、注入待编辑图片、回填/导出 state、
 * 以及离屏全分辨率合成（compose 模式）。
 */
(function () {
  'use strict';

  const api = window.api;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = src;
    });
  }

  async function imageToCanvas(img, cap) {
    const rr = cap ? Math.min(1, cap / Math.max(img.width, img.height)) : 1;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * rr));
    c.height = Math.max(1, Math.round(img.height * rr));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  // 等待 camera-watermark 全局逻辑就绪（多个经典 script 共享全局词法环境）
  async function waitReady(timeout = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (
        typeof render === 'function' &&
        typeof ingest === 'function' &&
        typeof renderTo === 'function' &&
        typeof computeOut === 'function' &&
        typeof buildControls === 'function' &&
        typeof syncStaticInputs === 'function' &&
        typeof state !== 'undefined' &&
        typeof photos !== 'undefined'
      ) {
        return true;
      }
      await sleep(60);
    }
    return false;
  }

  // slots 自定义图片是 canvas，无法 JSON 序列化：导出为 dataURL，恢复时重建
  async function serializeState() {
    const copy = JSON.parse(JSON.stringify(state));
    if (Array.isArray(copy.slots) && Array.isArray(state.slots)) {
      for (let i = 0; i < state.slots.length; i++) {
        const s = state.slots[i];
        if (s && s.img && !s.logo) {
          try {
            copy.slots[i]._imgData = s.img.toDataURL('image/png');
          } catch (e) {
            /* ignore */
          }
        }
      }
    }
    return copy;
  }

  function resetToDefault() {
    try {
      if (typeof _defaultState !== 'undefined' && typeof _applyHist === 'function') {
        _applyHist(_defaultState);
      }
    } catch (e) {
      /* ignore */
    }
    // LumEdit 嵌入语境的干净基线：纯文字角标 + 原比例输出，
    // 杜绝 camera-watermark 崩溃恢复把「模糊卡片 / 画框 / 改比例」带进来。
    // 仅在「无存档」首次进入时生效；用户主动切换的样式仍会随 savedState 保留。
    try {
      state.style = 'text';
      state.exportRatio = 'raw';
      state.blurRatio = 'auto';
    } catch (e) {
      /* ignore */
    }
  }

  async function restoreState(saved) {
    if (!saved) {
      resetToDefault();
      return;
    }
    // 先恢复自定义图片 canvas，再回填 state
    if (Array.isArray(saved.slots)) {
      for (const s of saved.slots) {
        if (s && s._imgData) {
          try {
            const im = await loadImage(s._imgData);
            s.img = await imageToCanvas(im, 1024);
          } catch (e) {
            /* ignore */
          }
        }
      }
    }
    Object.assign(state, saved);
    try {
      buildControls();
    } catch (e) {
      /* ignore */
    }
    try {
      syncStaticInputs();
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------- 嵌入版式（隐藏批量/多图/更新等与单张水印无关的部分） ----------------
  function injectEmbedStyle() {
    document.body.classList.add('lumedit-embed');
    const style = document.createElement('style');
    style.textContent = `
      #cwmSplash{display:none !important}
      body.lumedit-embed #app{grid-template-columns:0 1fr var(--right-w);grid-template-rows:var(--topbar-h) var(--toolbar-h) 1fr 0}
      body.lumedit-embed .left{display:none !important}
      body.lumedit-embed .statusbar{display:none !important}
      body.lumedit-embed .tabbar{display:none !important}
      body.lumedit-embed .drop-hint{display:none !important}
      body.lumedit-embed #btnSocialDy,body.lumedit-embed #btnSocialBili,body.lumedit-embed #btnSocialGh,
      body.lumedit-embed #btnPhone,body.lumedit-embed #btnAbout,body.lumedit-embed #themeSel,
      body.lumedit-embed #btnImportTop,body.lumedit-embed #btnSelAll,body.lumedit-embed #btnSelNone,
      body.lumedit-embed .tb-search,body.lumedit-embed .ab-slot{display:none !important}
      body.lumedit-embed .toolbar .sep{display:none !important}
      body.lumedit-embed #btnBatchExport,body.lumedit-embed #exportAsZip,
      body.lumedit-embed #exSuffix,body.lumedit-embed #fileNameTemplate,
      body.lumedit-embed #batchRatioGrid,body.lumedit-embed #batchMaxEdge,
      body.lumedit-embed .phone-only-export{display:none !important}
      #lmBar{margin-left:auto;display:flex;gap:8px;align-items:center}
      #lmBar .lm-btn{border:1px solid var(--line);background:var(--soft);color:var(--fg);
        border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;font-family:inherit}
      #lmBar .lm-btn.primary{background:#0A84FF;border-color:#0A84FF;color:#fff;font-weight:600}
      #lmTitle{font-weight:600;font-size:13px;color:var(--fg)}
    `;
    document.head.appendChild(style);
  }

  function injectTopBar(onApply) {
    const top = document.querySelector('.topbar');
    if (!top) return;
    const brand = top.querySelector('.brand');
    if (brand) {
      const logo = brand.querySelector('img');
      if (logo) logo.style.display = 'none'; // cwm-logo.png 未随包携带，避免裂图
      brand.lastChild.textContent = '水印工作室';
    }
    // 隐藏工具栏孤立的「A/B」文字（其槽位按钮已在 CSS 隐藏）
    document.querySelectorAll('.toolbar span').forEach((el) => {
      if ((el.textContent || '').trim() === 'A/B') el.style.display = 'none';
    });
    const bar = document.createElement('div');
    bar.id = 'lmBar';
    bar.innerHTML = `<span id="lmTitle">camera-watermark 引擎</span>
      <button class="lm-btn" id="lmCancel">取消</button>
      <button class="lm-btn primary" id="lmApply">应用到图片</button>`;
    top.appendChild(bar);
    document.getElementById('lmCancel').onclick = () => api && api.cwmCancel();
    document.getElementById('lmApply').onclick = () => onApply();
  }

  // ---------------- 编辑模式 ----------------
  async function startEdit(init) {
    injectEmbedStyle();
    // 等 camera-watermark 自身的 IndexedDB 崩溃恢复（async）先跑完，避免它晚于我们覆盖 state
    await sleep(350);
    try {
      localStorage.removeItem('cwm_ab_slots_v1');
    } catch (e) {
      /* ignore */
    }

    // 用原始文件 ingest，以完整读取 EXIF（机型/参数变量）；随后把底图替换为 LumEdit 调色结果
    if (init.origBuffer && init.fileName) {
      const file = new File([init.origBuffer], init.fileName, {
        type: init.mime || 'image/jpeg',
      });
      await ingest(file);
    } else if (init.baseDataUrl) {
      const img = await loadImage(init.baseDataUrl);
      photos.push({
        name: init.fileName || 'image',
        src: await imageToCanvas(img, 2200),
        meta: init.meta || {},
        exifBytes: null,
      });
      current = 0;
    }

    const ph = photos[current];
    if (ph && init.baseDataUrl) {
      const img = await loadImage(init.baseDataUrl);
      ph.src = await imageToCanvas(img, 2200);
    }

    await restoreState(init.savedState || null);
    injectTopBar(applyEdit);
    try {
      buildList();
    } catch (e) {
      /* ignore */
    }
    render();
  }

  async function applyEdit() {
    const ph = photos[current];
    if (!ph) {
      api.cwmCancel();
      return;
    }
    const out = computeOut(ph);
    const W = out.W,
      H = out.H;
    ph._crop = out.cx || out.cy ? { cx: out.cx, cy: out.cy } : null;
    const oc = new OffscreenCanvas(W, H);
    renderTo(oc.getContext('2d'), W, H, ph, ph._crop);
    const blob = await oc.convertToBlob({ type: 'image/png' });
    const previewDataUrl = await blobToDataURL(blob);
    const savedState = await serializeState();
    api.cwmApply({
      state: savedState,
      meta: JSON.parse(JSON.stringify(ph.meta || {})),
      previewDataUrl,
      width: W,
      height: H,
    });
  }

  // ---------------- 离屏全分辨率合成模式（导出用，无交互） ----------------
  async function startCompose(init) {
    document.documentElement.style.visibility = 'hidden';
    await sleep(200); // 等其启动恢复流程跑完，再用传入 state 覆盖
    const img = await loadImage(init.baseDataUrl);
    const src = await imageToCanvas(img, null);
    photos.length = 0;
    photos.push({
      name: 'compose',
      src,
      meta: init.meta || {},
      exifBytes: null,
    });
    current = 0;
    await restoreState(init.state || null);
    const ph = photos[0];
    const out = computeOut(ph);
    const W = out.W,
      H = out.H;
    const crop = out.cx || out.cy ? { cx: out.cx, cy: out.cy } : null;
    const oc = new OffscreenCanvas(W, H);
    renderTo(oc.getContext('2d'), W, H, ph, crop);
    const mime = init.format || 'image/jpeg';
    const blob = await oc.convertToBlob({ type: mime, quality: init.quality ?? 0.92 });
    const buf = await blob.arrayBuffer();
    api.cwmComposeResult({ buffer: buf, width: W, height: H });
  }

  // ---------------- 入口 ----------------
  (async function main() {
    const ok = await waitReady();
    if (!ok || !api) {
      console.error('[lm-bridge] cwm not ready or no api');
      return;
    }
    const init = await api.cwmRequestInit();
    if (!init) {
      console.error('[lm-bridge] no init payload');
      return;
    }
    try {
      if (init.compose) await startCompose(init);
      else await startEdit(init);
    } catch (e) {
      console.error('[lm-bridge] failed', e);
    }
  })();
})();
