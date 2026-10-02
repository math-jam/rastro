const TOKEN_KEY = 'os_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn)

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) payload = form
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload })
  } catch {
    throw new Error('Sem conexão com o servidor.')
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && token) onUnauthorized()
  if (!res.ok) throw new Error(data.error || 'Erro inesperado.')
  return data
}

// Reduz fotos de celular (vários MB) antes do envio: máx. 1600px, JPEG 82%.
export async function compressImage(file, max = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/')) return file
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality))
    return blob && blob.size < file.size ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

export const fmtDate = (s) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export const fmtNum = (n) =>
  n == null || n === '' ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export const fmtDateTime = (s) => {
  if (!s) return ''
  const [d, t = ''] = s.split(' ')
  return `${fmtDate(d)} ${t.slice(0, 5)}`
}
