/**
 * 配置层 —— 一份规格，两个出口。
 *
 * 为什么不用「静态 import schemastery」：
 * 那会让 `@deepseek-ai/schemastery` 成为运行时硬依赖。一旦它在目标机器上
 * 解析不到，`import` 直接抛错 → **整个插件加载失败**。
 * 对于一个"装上就该忘掉它"的插件，这个失败模式不能接受。
 *
 * 所以：
 *  - `CONFIG_SPEC` 是唯一真相源，纯 JS，零依赖。
 *  - `resolveConfig()` 自己补默认值、做类型转换和范围钳制 —— 保证行为**一定确定**。
 *  - `buildSchema(z)` 在 schemastery 可用时才调用，额外产出给设置表单用的 schema。
 *    拿不到就没有表单，但**所有选项照样能在 `cordis.patch.yml` 的 `config:` 里写**。
 */

/**
 * @typedef {'boolean'|'number'|'string'} ConfigType
 * @typedef {object} ConfigField
 * @property {string} key
 * @property {ConfigType} type
 * @property {*} default
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {string} label
 */

/** @type {ConfigField[]} */
export const CONFIG_SPEC = [
  {
    key: 'dataDir',
    type: 'string',
    default: '',
    label: '档案目录（留空 = ~/.dsh/feiyu-diary）',
  },
  {
    key: 'enabled',
    type: 'boolean',
    default: true,
    label: '总开关',
  },
  {
    key: 'includePersona',
    type: 'boolean',
    default: true,
    label: '把人格内核一起注入（装了别的人设插件就关掉）',
  },
  {
    key: 'budgetTokens',
    type: 'number',
    // 2000 → 3000 → 6000。
    //
    // 2000 装不下常驻段（2680），「最近的事」只剩 2 条。
    // 3000 能给到 6 条。
    //
    // 2026-11-02 提到 6000：召回那栏从「最多 2 条摘要」改成「最多 15 条正文」，
    // 15 条正文实测约 4800 token，3000 根本装不下 —— 会被整段裁掉，
    // 那这条鱼就一条旧事都想不起来，比改之前还差。
    default: 6000,
    min: 200,
    max: 12000,
    step: 100,
    label: '注入预算（token）',
  },
  {
    key: 'model',
    type: 'string',
    default: '',
    label: '固化用模型（留空 = 跟随当前默认模型）',
  },
  {
    key: 'reasoningEffort',
    type: 'string',
    default: 'off',
    label: '固化的思考档位（off/low/high/max；保持 off）',
  },
  {
    key: 'maxTokens',
    type: 'number',
    default: 900,
    min: 200,
    max: 4000,
    step: 1,
    label: '固化最大输出 token',
  },
  {
    key: 'thirdPartyRedaction',
    type: 'boolean',
    default: true,
    label: '第三方隐私泛化',
  },
  {
    key: 'amountThreshold',
    type: 'number',
    default: 100,
    min: 0,
    step: 1,
    label: '金额泛化门槛（低于此值保留）',
  },
  {
    key: 'minSalience',
    type: 'number',
    default: 0.15,
    min: 0,
    max: 1,
    step: 0.05,
    label: '日记重要度门槛',
  },
  {
    key: 'highSim',
    type: 'number',
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
    // ⚠️ 2026-11-02 之后**对自动注入不再生效**。
    //
    // 原来自动注入走 selectMemories，这道阈值决定"相似度多高就必定提起那件旧事"。
    // 现在那条路改成 BM25 直接给一批正文，靠 `recallScoreRatio` 那道相对门槛，
    // 这个绝对值就没有位置了。
    //
    // 字段保留不删：删了老配置里的值会被静默忽略（反而更坏），
    // 而且 selectMemories 还在被测试和外部调用。**但界面上改它不会有任何效果。**
    label: '必触发的相似度阈值（4.1 起对自动注入不生效，见 recallScoreRatio）',
  },
  {
    key: 'recentEntries',
    type: 'number',
    // 8 → 3（2026-11-02）。它只在新会话第一轮和压缩之后整段重灌，
    // 平时不占地方 —— 所以"8 条"其实大半时候没被读到。
    // 3 条够交代"我们上次在干什么"，而且省下 1600 token 给召回那栏。
    default: 3,
    min: 0,
    max: 30,
    step: 1,
    label: '「最近的事」最多列几条（不靠相似度，永远在场）',
  },
  {
    key: 'recallFanout',
    type: 'number',
    // ── 2026-11-02：召回从「模型挑 2 条」改成「BM25 直接给最多 15 条正文」──
    //
    // 原来走一次模型调用：480 行索引（约 1.6 万 token，全价）塞给模型挑 3 条。
    // 实测那一次调用跟一整轮聊天一样贵，而更糟的是 —— **摘要索引会漏**。
    //
    // 现在改成：BM25 打在正文上（本地、免费、0.2ms），直接把这批完整正文
    // 放进注入。省掉一次模型调用，也省掉"挑"这一步可能挑错的环节。
    //
    // 这是个**上限**，不是目标数。真正的条数由 `recallScoreRatio` 那道相对门槛决定 ——
    // 实测按 15 条硬取，一大半是只撞上一个常用词的噪音。
    default: 15,
    min: 0,
    max: 40,
    step: 1,
    label: '按相似度最多捞几条正文进注入（0 = 只留最近的事）',
  },
  {
    key: 'recallScoreRatio',
    type: 'number',
    // 只留分数 ≥ 最高分 × 这个比例的条目。
    //
    // 为什么是相对值：相似度是饱和函数，绝对刻度会随查询长短漂移
    // （长问句最高才 0.7，短词全在 0.99），固定分数线要么全砍要么全留。
    //
    // 0.85 → 0.70（2026-11-02 当天返工）。0.85 砍过头了：
    // 查「南京」BM25 命中 5 条 —— 0.982 / 0.972 / 0.970 / 0.969 / 0.948，
    // 五条全相关 —— 乘下来只剩 1 条进注入。
    // **说好给一批旧事，实际给一条，比改之前的 2 条还差。**
    //
    // 分布是不稳的：有的查询第 5 名还有 0.86，有的第 2 名就断了。
    // 固定比例猜不准分布，宁可往宽了给 ——
    // **漏掉真事的代价，比多带两条噪音大得多。**
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.01,
    label: '召回门槛（只留分数接近最高分的，越低给得越多）',
  },
  {
    key: 'maxShowPerTurn',
    type: 'number',
    default: 4,
    min: 0,
    max: 12,
    step: 1,
    // ⚠️ 2026-11-02 之后**对自动注入不再生效**。条数改由 recallFanout 控。
    // 保留字段的理由同 highSim。
    label: '「突然想起来」最多几条（4.1 起不生效，改看 recallFanout）',
  },
  {
    key: 'wanderChance',
    type: 'number',
    default: 0.08,
    min: 0,
    max: 0.5,
    step: 0.01,
    // ⚠️ 2026-11-02 之后**不再生效**。
    //
    // "走神"是 selectMemories 里那一步随机想起一条旧事。现在按 BM25 给一批，
    // 没有"掷骰子"这个动作了 —— 那一步本来就是为"只给 1 条"打掩护的。
    // 保留字段的理由同 highSim。
    label: '走神想起旧事的概率（4.1 起不生效）',
  },
  {
    // ── 续写窗口 ──
    //
    // 同一个会话里，隔几轮之内还写到同一件事，就**并进上一条**，不新增。
    //
    // 为什么要有这一项：实测 8 小时写了 25 条，其中 15 条来自同一个会话，
    // 间隔有 1 / 1 / 3 / 3 / 4 / 4 / 5 分钟的 —— **五分钟里写三条**。
    // 那不是"记得多"，是同一件事被拆成三次写。
    //
    // 2026-10-27 之前它硬编码在 host 里（4 轮），配置里没有这一项，
    // 所以谁也调不了。现在暴露出来，默认也调宽了。
    //
    // ⚠️ **没做成"每天上限"**。上限会把"那天真的很沉"一起裁掉 ——
    // 而那种日子恰恰是最不该裁的。限制合并不是限制记忆。
    key: 'appendWindowTurns',
    type: 'number',
    default: 20,
    min: 0,
    max: 200,
    step: 1,
    label: '续写窗口（同会话里隔几轮内写到同一件事就并进上一条，0 = 关掉）',
  },
  {
    key: 'offPeakHours',
    type: 'string',
    default: '00:30-08:30',
    label: '低峰时段（HH:MM-HH:MM）',
  },
  {
    key: 'deferToOffPeak',
    type: 'boolean',
    default: false,
    label: '把固化推迟到低峰时段',
  },
  {
    key: 'debugLog',
    type: 'boolean',
    default: false,
    label: '开发期调试日志',
  },
];

/** 全部默认值（冻结） */
export const CONFIG_DEFAULTS = Object.freeze(
  Object.fromEntries(CONFIG_SPEC.map((f) => [f.key, f.default])),
);

/**
 * DSH 0.2.0-rc.2 起，loader 会把 `config:` 里的每个值包成 cosmokit 的
 * **volatile 引用**（为了 `patchReload: live` 热重载）：
 *
 *   { get: () => current, [Symbol.for("cosmokit.volatile.write")]: (v) => {...} }
 *
 * 它是 Object.freeze 过的普通对象，get 是函数值 —— 于是：
 *   JSON.stringify(ref) → "{}"
 *   Object.keys(ref)    → ["get"]
 *   String(ref)         → **"[object Object]"**
 *
 * 我们原来把它当值用，后果比"路径难看"严重得多：
 *
 *   · **所有 string 字段**变成 "[object Object]"：
 *       dataDir       → 变成相对路径，跟着进程 cwd 跑。换个目录启动就"搬家"，
 *                       表现像失忆，而且全程无报错。
 *       model         → 不存在的模型名，**固化那次调用根本发不出去**，
 *                       只剩 feiyu_note 能写进去。
 *       reasoningEffort / offPeakHours → 同样失效。
 *   · **number / boolean** 静默回落默认值（Number(ref) 是 NaN、布尔比不上），
 *     用户改不动 budgetTokens / minSalience，也没有任何提示。
 *
 * 正确读法是 `.get()`（DSH 自家插件都这么写，比如 dsh-bash-local 的 workdir）。
 *
 * 用 Symbol.for 探测、不 import cosmokit —— 保住「零运行时依赖」。
 *
 * 报这个 bug 的朋友把机制定位到了 cosmokit 的那一行，还贴了只读探针的输出。
 * 我原来那个"只认绝对路径"的补丁只是治标：它拦住了 [object Object] 当路径，
 * 但 model / offPeakHours 照样坏，数字布尔照样静默回落。
 */
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write');

function unref(value) {
  if (typeof value !== 'object' || value === null) return value;
  // volatile 的判据：写着 write symbol，而且 get 是函数
  if (VOLATILE_WRITE in value && typeof value.get === 'function') {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}

function coerce(field, value) {
  value = unref(value);
  if (value === undefined || value === null) return field.default;

  if (field.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return field.default;
  }

  if (field.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return field.default;
    let out = n;
    if (Number.isFinite(field.min)) out = Math.max(field.min, out);
    if (Number.isFinite(field.max)) out = Math.min(field.max, out);
    return out;
  }

  // ⚠️ 别对非字符串做 String(value) —— 那正是把对象变成 "[object Object]" 的那一步。
  // 配置项不是字符串，说明上层给错了；回默认比"变成一串垃圾"好排查得多。
  return typeof value === 'string' ? value : field.default;
}

/**
 * 把原始配置（来自 `cordis.patch.yml` 的 `config:`）规整成一定合法的配置对象。
 * **永不抛错** —— 坏配置退回默认值。
 *
 * @param {unknown} raw
 * @returns {Record<string, any>}
 */
export function resolveConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  /** @type {Record<string, any>} */
  const out = {};
  for (const field of CONFIG_SPEC) out[field.key] = coerce(field, src[field.key]);
  return out;
}

/**
 * 用 schemastery 构造 Config。**只在能 import 到 schemastery 时调用。**
 *
 * 注意 `volatile` 是**链式方法**（`z.string().volatile()`），
 * 而且必须落在固定对象路径上 —— 不能嵌在数组、union、dict 里。
 *
 * @param {any} z schemastery 默认导出
 * @returns {any}
 */
export function buildSchema(z) {
  /** @type {Record<string, any>} */
  const shape = {};
  for (const f of CONFIG_SPEC) {
    let s;
    if (f.type === 'boolean') s = z.boolean();
    else if (f.type === 'number') {
      s = z.number();
      if (Number.isFinite(f.step)) s = s.step(f.step);
      if (Number.isFinite(f.min)) s = s.min(f.min);
      if (Number.isFinite(f.max)) s = s.max(f.max);
    } else s = z.string();
    shape[f.key] = s.default(f.default).volatile();
  }
  return z.object(shape);
}

/**
 * 判断"现在是不是低峰时段"。配置成 `HH:MM-HH:MM`；跨午夜也支持。
 *
 * @param {string} spec
 * @param {Date} [now]
 * @returns {boolean} 配置不合法时返回 true（即"随时可以跑"，不让坏配置卡死功能）
 */
export function isOffPeak(spec, now = new Date()) {
  if (typeof spec !== 'string') return true;
  const m = spec.match(/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/);
  if (m === null) return true;

  const [, sh, sm, eh, em] = m;
  const start = Number(sh) * 60 + Number(sm);
  const end = Number(eh) * 60 + Number(em);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return true;

  const cur = now.getHours() * 60 + now.getMinutes();
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
}

/**
 * 距离下一个低峰时段开始还有多少毫秒。已经在低峰里就返回 0。
 *
 * @param {string} spec
 * @param {Date} [now]
 * @returns {number}
 */
export function msUntilOffPeak(spec, now = new Date()) {
  if (isOffPeak(spec, now)) return 0;
  const m = typeof spec === 'string' ? spec.match(/^\s*(\d{1,2}):(\d{2})/) : null;
  if (m === null) return 0;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const cur = now.getHours() * 60 + now.getMinutes();
  let delta = start - cur;
  if (delta <= 0) delta += 24 * 60;
  return delta * 60000;
}
