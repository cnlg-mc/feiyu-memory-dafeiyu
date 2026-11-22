/**
 * 肥鱼日记 · 客户端半边（手写 bundle）
 *
 * ─────────────────────────────────────────────────────────────
 * 这个文件**没有经过任何打包器**，也没有任何 npm 依赖。它是故意的。
 *
 * DSH 的浏览器插件契约只有三条（都是端到端侦察出来的，别自己发明）：
 *
 *   1. 文件必须调用 `window.__ModuleLoader__.load({ id, factory })`。
 *      "执行 bundle 只注册工厂；模块副作用在物化时才跑" —— 所以整个
 *      插件体都待在 factory 闭包里。
 *   2. `id` **必须等于包名**（这里是 `feiyu-memory`）。浏览器模块身份
 *      就是解析出来的包名；两个来源解析到同一个包名会让组合直接失败。
 *   3. `factory(require)` 返回一个 Cordis 插件：`{ name, inject, apply }`。
 *
 * `require` 能解析的只有外壳那张**冻结的模块表**（PLATFORM_MODULES：
 * React、Cordis 和静态 UI 库）。我们只 require `react`，所以
 * `dsh.client.external` 是空的 —— 不向任何别的包借东西。
 *
 * 【为什么不用 JSX】
 * 没有打包器，就没有 JSX 变换。所以全程 `React.createElement`。
 *
 * 【为什么不 import DSH 的 UI 组件库】
 * 官方规范要求客户端插件照抄 markup、只用 `--dsw-alias-*` 主题 token，
 * 而不是 import `@deepseek-ai/dsh-client-ui-primitives`。照做的好处很实在：
 * **我们不跟任何插件共享运行时代码**，别的插件换 React 版本、换 UI 库版本，
 * 都伤不到我们。`dsh-context` 就借了那个库，它承担了我们不用承担的风险。
 *
 * ─────────────────────────────────────────────────────────────
 * 界面与 dsh-go App 版的「肥鱼记忆」面板**保持相同**：四页
 * 手记 / 人格 / 记忆 / 关于。看、改、删、带走都在这一个面板里，
 * 网页和手机看到的是同一份档案、同一套操作。
 */
window.__ModuleLoader__.load({
  id: 'feiyu-memory-dafeiyu',

  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect } = React;

    /** 侧栏格子的 id，同时也是主面板的 key。**必须与注册时一致。** */
    const PANEL_ID = 'feiyu-diary';
    /** 主机的数据接口前缀，和 host 半边的 PANEL_BASE 必须对得上 */
    const API = '/feiyu-diary';
    const VERSION = '0.3.3';

    /**
     * 主题 token。全部走 CSS 变量，浅色/深色自动跟着切换 ——
     * 这几个 token 的 `requiresLightAndDark` 都是 true，写死颜色就会翻车。
     */
    const C = {
      bg: 'var(--dsw-alias-bg-base)',
      layer1: 'var(--dsw-alias-bg-layer-1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      border1: 'var(--dsw-alias-border-l1)',
      border2: 'var(--dsw-alias-border-l2)',
      text1: 'var(--dsw-alias-label-primary)',
      text2: 'var(--dsw-alias-label-secondary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
      err: 'var(--dsw-alias-state-error-primary)',
      brand: 'var(--dsw-alias-brand-primary)',
    };

    /* ───────────────────────── 图标 ───────────────────────── */

    function Icon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 20;
      const active = Boolean(props && props.active);
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          role: 'img',
          'aria-label': '肥鱼记忆',
          style: { display: 'block', opacity: active ? 1 : 0.72 },
        },
        h('ellipse', {
          cx: 14,
          cy: 12,
          rx: 7.6,
          ry: 5.2,
          stroke: 'currentColor',
          strokeWidth: 1.5,
        }),
        h('path', {
          d: 'M6.9 12 L2 8.2 L2 15.8 Z',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinejoin: 'round',
        }),
        h('circle', { cx: 18.4, cy: 10.6, r: 1.05, fill: 'currentColor' }),
      );
    }

    /* ───────────────────────── 小组件 ───────────────────────── */

    function Section(props) {
      return h(
        'section',
        { style: { marginTop: 22 } },
        h(
          'h3',
          {
            style: {
              margin: '0 0 10px',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: C.text2,
            },
          },
          props.title,
        ),
        props.children,
      );
    }

    function Empty(props) {
      return h(
        'p',
        { style: { margin: 0, fontSize: 13, lineHeight: 1.7, color: C.text2 } },
        props.text,
      );
    }

    function linkStyle(color) {
      return {
        margin: 0,
        padding: 0,
        border: 0,
        background: 'none',
        color,
        font: 'inherit',
        fontSize: 12,
        cursor: 'pointer',
        textDecoration: 'underline',
        textUnderlineOffset: 3,
      };
    }

    const btnStyle = (primary) => ({
      padding: '6px 14px',
      border: primary ? `1px solid ${C.brand}` : `1px solid ${C.border2}`,
      borderRadius: 6,
      background: primary ? C.brand : C.layer2,
      color: primary ? 'var(--dsw-alias-bg-base)' : C.text1,
      fontSize: 12,
      cursor: 'pointer',
      font: 'inherit',
    });

    const fieldStyle = {
      boxSizing: 'border-box',
      width: '100%',
      padding: '8px 10px',
      border: `1px solid ${C.border2}`,
      borderRadius: 6,
      background: C.layer1,
      color: C.text1,
      font: 'inherit',
      fontSize: 13,
      lineHeight: 1.6,
      resize: 'vertical',
    };

    /** 时间说人话：今天 / 昨天 / 3 天前 / 10-05 */
    function dayLabel(ts) {
      if (!Number.isFinite(ts)) return '';
      const startOfDay = (t) => {
        const d = new Date(t);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      };
      const days = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
      if (days <= 0) return '今天';
      if (days === 1) return '昨天';
      if (days < 7) return `${days} 天前`;
      const d = new Date(ts);
      return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function fmtTime(ms) {
      if (!Number.isFinite(ms)) return '';
      const d = new Date(ms);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    /* ───────────────────────── 一条日记（只读页用） ───────────────────────── */

    function Entry(props) {
      const e = props.entry;
      const when = dayLabel(e.created_at);
      return h(
        'article',
        {
          style: {
            padding: '12px 14px',
            marginBottom: 8,
            borderRadius: 10,
            background: C.layer1,
            border: `1px solid ${C.border1}`,
          },
        },
        h('div', { style: { marginBottom: 6, fontSize: 11, color: C.text2 } }, when),
        h(
          'p',
          { style: { margin: 0, fontSize: 13, lineHeight: 1.75, color: C.text1 } },
          e.text,
        ),
      );
    }

    /* ───────────────────────── 主面板 ───────────────────────── */

    function Panel() {
      const [phase, setPhase] = useState('loading');
      const [state, setState] = useState(null);
      const [error, setError] = useState('');
      const [toast, setToast] = useState('');
      const [tick, setTick] = useState(0);
      const [tab, setTab] = useState('hand');

      // 表单本地状态
      const [editHand, setEditHand] = useState('');
      const [editPersona, setEditPersona] = useState('');
      const [diaryIndex, setDiaryIndex] = useState(1);
      const [editDiary, setEditDiary] = useState('');

      useEffect(() => {
        let alive = true;
        fetch(`${API}/state`, { headers: { Accept: 'application/json' } })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((data) => {
            if (!alive) return;
            setState(data);
            setEditHand(String(data.hand ?? ''));
            setEditPersona(String(data.persona ?? ''));
            setPhase('ready');
          })
          .catch((err) => {
            if (!alive) return;
            setError(String((err && err.message) || err));
            setPhase('error');
          });
        return () => {
          alive = false;
        };
      }, [tick]);

      function post(path, body, okMsg) {
        fetch(`${API}/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
          .then((r) =>
            r
              .json()
              .catch(() => ({}))
              .then((b) => ({ ok: r.ok, b })),
          )
          .then(({ ok, b }) => {
            if (!ok) throw new Error(b?.error || `HTTP`);
            setToast(okMsg);
            setTick((n) => n + 1);
          })
          .catch((err) => setToast(`失败：${String((err && err.message) || err)}`));
      }

      useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(''), 2600);
        return () => clearTimeout(t);
      }, [toast]);

      const wrap = { height: '100%', overflowY: 'auto', background: C.bg, color: C.text1 };
      const inner = { maxWidth: 720, margin: '0 auto', padding: '24px 24px 60px' };

      if (phase === 'loading') {
        return h('div', { style: wrap }, h('div', { style: inner }, h(Empty, { text: '翻档案…' })));
      }
      if (phase === 'error') {
        return h(
          'div',
          { style: wrap },
          h(
            'div',
            { style: inner },
            h(Empty, { text: `读不到档案：${error}` }),
            h(
              'button',
              {
                type: 'button',
                onClick: () => setTick((n) => n + 1),
                style: { ...linkStyle(C.brand), marginTop: 10 },
              },
              '再试一次',
            ),
          ),
        );
      }

      const d = state || {};
      const head = [];
      head.push(`本地存储 · ${d.count || 0} 条`);
      if (d.familiarity !== undefined) head.push(`熟悉度 ${Number(d.familiarity).toFixed(2)}`);
      if (d.dirState) head.push(d.dirState);

      // 记忆页：全部日记（state 里 diary 已是倒序，正序按时间）
      const events = Array.isArray(d.diary)
        ? d.diary.slice().sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
        : [];
      const diaryList = events.map((e, i) => ({ n: i + 1, e }));
      const sel = events[Math.max(0, Math.min(events.length - 1, Number(diaryIndex) - 1))];

      const tabs = [
        ['hand', '手记'],
        ['persona', '人格'],
        ['memory', '记忆'],
        ['about', '关于'],
      ];

      return h(
        'div',
        { style: wrap },
        h(
          'div',
          { style: inner },

          // ── 标题 ──
          h('h2', { style: { margin: 0, fontSize: 18, fontWeight: 600 } }, `肥鱼记忆 v${VERSION}`),
          h('p', { style: { margin: '6px 0 0', fontSize: 12, color: C.text2 } }, head.join(' · ')),

          // ── toast ──
          toast
            ? h(
                'p',
                {
                  style: {
                    margin: '10px 0 0',
                    padding: '8px 10px',
                    fontSize: 12,
                    color: C.text1,
                    background: C.layer2,
                    border: `1px solid ${C.border2}`,
                    borderRadius: 6,
                  },
                },
                toast,
              )
            : null,

          // ── 页签 ──
          h(
            'div',
            {
              style: {
                display: 'flex',
                gap: 4,
                marginTop: 18,
                borderBottom: `1px solid ${C.border2}`,
              },
            },
            tabs.map(([key, label]) =>
              h(
                'button',
                {
                  key,
                  type: 'button',
                  onClick: () => setTab(key),
                  style: {
                    padding: '8px 12px',
                    border: 0,
                    borderBottom: tab === key ? `2px solid ${C.brand}` : '2px solid transparent',
                    background: 'none',
                    color: tab === key ? C.brand : C.text2,
                    fontSize: 13,
                    fontWeight: tab === key ? 600 : 400,
                    cursor: 'pointer',
                    font: 'inherit',
                  },
                },
                label,
              ),
            ),
          ),

          // ── 手记页 ──
          tab === 'hand'
            ? h(
                'div',
                null,
                h(Empty, { text: '手记：留给每一棒的话，每轮都在。' }),
                h('pre', {
                  style: {
                    margin: '12px 0 0',
                    padding: 12,
                    background: C.layer1,
                    border: `1px solid ${C.border1}`,
                    borderRadius: 8,
                    fontSize: 12,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 320,
                    overflowY: 'auto',
                  },
                }, String(d.hand ?? '')),
                h(
                  Section,
                  { title: '编辑手记（整段替换）' },
                  h('textarea', {
                    style: { ...fieldStyle, minHeight: 160 },
                    value: editHand,
                    maxLength: 2000,
                    onChange: (ev) => setEditHand(ev.target.value),
                  }),
                  h(
                    'div',
                    { style: { marginTop: 10, display: 'flex', gap: 8 } },
                    h(
                      'button',
                      {
                        type: 'button',
                        style: btnStyle(true),
                        onClick: () => post('saveHand', { text: editHand }, '手记已保存'),
                      },
                      '保存手记',
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        style: btnStyle(false),
                        onClick: () => {
                          if (window.confirm('确认清空手记？')) post('saveHand', { text: '' }, '手记已清空');
                        },
                      },
                      '清空手记',
                    ),
                  ),
                ),
              )
            : null,

          // ── 人格页 ──
          tab === 'persona'
            ? h(
                'div',
                null,
                h(Empty, { text: '人格：锚点内是出厂设定，锚点外是后来学的。' }),
                h('pre', {
                  style: {
                    margin: '12px 0 0',
                    padding: 12,
                    background: C.layer1,
                    border: `1px solid ${C.border1}`,
                    borderRadius: 8,
                    fontSize: 12,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 320,
                    overflowY: 'auto',
                  },
                }, String(d.persona ?? '')),
                h(
                  Section,
                  { title: '编辑人格（整段替换，请保留锚点注释）' },
                  h('textarea', {
                    style: { ...fieldStyle, minHeight: 160 },
                    value: editPersona,
                    maxLength: 2000,
                    onChange: (ev) => setEditPersona(ev.target.value),
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      style: { ...btnStyle(true), marginTop: 10 },
                      onClick: () => post('savePersona', { text: editPersona }, '人格已保存'),
                    },
                    '保存人格',
                  ),
                ),
              )
            : null,

          // ── 记忆页 ──
          tab === 'memory'
            ? h(
                'div',
                null,
                h(
                  'p',
                  { style: { fontSize: 13, color: C.text2, margin: '14px 0 8px' } },
                  `全部日记（按时间排，共 ${events.length} 条）：`,
                ),
                h(
                  'div',
                  {
                    style: {
                      maxHeight: 300,
                      overflowY: 'auto',
                      border: `1px solid ${C.border1}`,
                      borderRadius: 8,
                      padding: 8,
                      background: C.layer1,
                    },
                  },
                  diaryList.length === 0
                    ? h(Empty, { text: '还没有日记。' })
                    : diaryList.map(({ n, e }) =>
                        h(
                          'div',
                          {
                            key: e.id,
                            style: {
                              padding: '6px 4px',
                              borderBottom: `1px solid ${C.border1}`,
                              fontSize: 12,
                              color: C.text2,
                              cursor: 'pointer',
                            },
                            onClick: () => {
                              setDiaryIndex(n);
                              setEditDiary(String(e.text ?? ''));
                            },
                          },
                          `${n}. ${String(e.text ?? '').slice(0, 40)}${String(e.text ?? '').length > 40 ? '…' : ''}  · ${fmtTime(e.created_at)}`,
                        ),
                      ),
                ),
                h(
                  Section,
                  { title: '编辑第 N 条（序号见上）' },
                  h(
                    'div',
                    { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 } },
                    h('span', { style: { fontSize: 12, color: C.text2 } }, '第几条'),
                    h('input', {
                      type: 'number',
                      min: 1,
                      max: events.length || 1,
                      value: diaryIndex,
                      style: { ...fieldStyle, width: 90 },
                      onChange: (ev) => {
                        const n = Number(ev.target.value);
                        setDiaryIndex(n);
                        const t = events[Math.max(0, Math.min(events.length - 1, n - 1))];
                        setEditDiary(t ? String(t.text ?? '') : '');
                      },
                    }),
                  ),
                  h('textarea', {
                    style: { ...fieldStyle, minHeight: 140 },
                    value: editDiary,
                    maxLength: 2000,
                    onChange: (ev) => setEditDiary(ev.target.value),
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      style: { ...btnStyle(true), marginTop: 10 },
                      onClick: () => post('saveDiary', { index: diaryIndex, text: editDiary }, '日记已保存'),
                    },
                    '保存这条',
                  ),
                ),
                h(
                  Section,
                  { title: '删除第 N 条' },
                  h(
                    'div',
                    { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                    h('input', {
                      type: 'number',
                      min: 1,
                      max: events.length || 1,
                      value: diaryIndex,
                      style: { ...fieldStyle, width: 90 },
                      onChange: (ev) => setDiaryIndex(Number(ev.target.value)),
                    }),
                    h(
                      'button',
                      {
                        type: 'button',
                        style: btnStyle(false),
                        onClick: () => {
                          if (window.confirm(`删除第 ${diaryIndex} 条？`)) post('delDiary', { index: diaryIndex }, '已删除这条记忆');
                        },
                      },
                      '删除这条',
                    ),
                  ),
                ),
              )
            : null,

          // ── 关于页 ──
          tab === 'about'
            ? h(
                'div',
                null,
                h(
                  Section,
                  { title: '档案信息' },
                  h(
                    'div',
                    { style: { fontSize: 13, lineHeight: 2 } },
                    h('div', null, `版本：v${VERSION}`),
                    h('div', null, `档案目录：${d.dir ?? ''}`),
                    h('div', null, `熟悉度：${Number(d.familiarity ?? 0).toFixed(2)}`),
                    h('div', null, `状态：${d.dirState ?? ''}`),
                  ),
                ),
                h(
                  'p',
                  { style: { margin: '14px 0 0', padding: 10, fontSize: 12, lineHeight: 1.7, color: C.text2, background: C.layer2, borderRadius: 6 } },
                  '删掉的记忆会立碑，不会被磁盘合并捞回来。人格与手记的编辑即时写盘。',
                ),
                h(
                  'button',
                  { type: 'button', style: { ...btnStyle(false), marginTop: 12 }, onClick: () => setTick((n) => n + 1) },
                  '刷新',
                ),
                h(
                  Section,
                  { title: '带走' },
                  h(
                    'a',
                    { href: `${API}/export`, download: '', style: { ...linkStyle(C.brand), fontSize: 13 } },
                    '导出档案（.dshpack）',
                  ),
                  h(
                    'p',
                    { style: { margin: '10px 0 0', fontSize: 12, lineHeight: 1.7, color: C.text2 } },
                    '它就是一个普通文件夹。可以直接打开、改、拷走。',
                  ),
                ),
              )
            : null,
        ),
      );
    }

    /* ───────────────────────── 注册 ───────────────────────── */

    function apply(ctx) {
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 40, label: () => '肥鱼记忆' },
          Icon,
        ),
      );

      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel),
      );
    }

    return { name: 'feiyu-memory-dafeiyu', inject: ['slots'], apply };
  },
});
