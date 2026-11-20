// 用本机已登录的国际版 WorkBuddy 账号生图（hy-image-3.5，约 0.03 积分/张）。
// 凭证从 ~/.dsh/.credentials.yaml 读（插件存的明文 JSON），照抄官方 ImageService 契约：
//   POST https://www.workbuddy.ai/v2/images/generations
//   body { model, prompt, size, response_format: 'b64_json' }
//   Authorization: Bearer <access_token>
// 输出：把第一张图下载到 out 路径（png）。
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CRED_PATH = '/root/.dsh/.credentials.yaml'
const REF = 'WORKBUDDY_ACCOUNT_6EDC3BCA'
const GLOBAL_BASE = 'https://www.workbuddy.ai'
const UA = 'WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0'

// YAML 折行还原（同插件测试里的逻辑）
function extractYamlScalar(text, ref) {
  const lines = text.split(/\r?\n/)
  const esc = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pat = new RegExp(`^(\\s*)${esc}:[ \\t]*(.*)$`)
  for (let i = 0; i < lines.length; i++) {
    const m = pat.exec(lines[i]); if (!m) continue
    const indent = m[1].length
    const dq = m[2].trimStart().startsWith('"')
    let s = m[2].trimEnd()
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      if (line.trim().length === 0) continue
      if (line.length - line.trimStart().length <= indent) break
      const piece = line.trim()
      const tr = /\\+$/.exec(s)?.[0].length ?? 0
      s = dq && tr % 2 === 1 ? s.slice(0, -1) + piece : `${s} ${piece}`
    }
    if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1).replace(/''/g, "'")
    else if (s.startsWith('"') && s.endsWith('"')) s = JSON.parse(s)
    return s
  }
  throw new Error(`找不到凭据 ${ref}`)
}

function readCredential() {
  const text = readFileSync(CRED_PATH, 'utf8')
  const c = JSON.parse(extractYamlScalar(text, REF))
  if (typeof c.access_token !== 'string' || c.access_token === '') throw new Error('没有 access_token')
  return c
}

function headers(cred) {
  const h = {
    Authorization: `Bearer ${cred.access_token}`,
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'User-Agent': UA,
    'X-Requested-With': 'XMLHttpRequest',
  }
  if (cred.uid) h['X-User-Id'] = cred.uid
  else h['X-No-User-Id'] = '1'
  if (cred.domain) h['X-Domain'] = cred.domain
  else h['X-No-Department-Info'] = '1'
  return h
}

async function main() {
  const prompt = process.argv[2] || 'A cute chubby blue fish mascot, round body, simple flat cartoon style, friendly eyes, solid background, app icon, centered, clean'
  const size = process.argv[3] || '1024x1024'
  const out = resolve(process.argv[4] || '/root/.dsh/dsh-go/plugins/feiyu-memory-local/assets/icon.png')

  const cred = readCredential()
  console.log('账号区域:', /workbuddy\.ai/i.test(cred.domain || '') ? '国际版' : '其它')
  console.log('模型: hy-image-3.5 | size:', size, '| 提示:', prompt.slice(0, 60))

  const body = { model: 'hy-image-3.5', prompt, size, response_format: 'b64_json' }
  const resp = await fetch(`${GLOBAL_BASE}/v2/images/generations`, {
    method: 'POST',
    headers: headers(cred),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  })
  const text = await resp.text()
  if (!resp.ok) {
    console.error('HTTP', resp.status, text.slice(0, 500))
    process.exit(1)
  }
  let payload
  try { payload = JSON.parse(text) } catch { console.error('非 JSON 返回:', text.slice(0, 300)); process.exit(1) }
  console.log('code:', payload.code, '| msg:', payload.msg || '')
  const item = payload?.data?.data?.[0] ?? {}
  let bytes = null
  if (typeof item.b64_json === 'string') {
    bytes = Buffer.from(item.b64_json, 'base64')
  } else if (typeof item.url === 'string') {
    const ir = await fetch(item.url, { signal: AbortSignal.timeout(60000) })
    bytes = Buffer.from(await ir.arrayBuffer())
  }
  if (!bytes || bytes.length < 100) { console.error('没拿到图片数据:', JSON.stringify(payload).slice(0, 400)); process.exit(1) }
  const { mkdirSync } = await import('node:fs')
  mkdirSync(resolve(out, '..'), { recursive: true })
  writeFileSync(out, bytes)
  console.log('已保存:', out, '| 字节:', bytes.length, '| 扣费积分:', payload?.data?.usage?.credit ?? '(未报告)')
}

main().catch(e => { console.error('失败:', e.message); process.exit(1) })
