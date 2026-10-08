import { unzipSync, strFromU8 } from 'fflate'

const R = 6371008.8 // raio médio da Terra (m)
const rad = (d) => (d * Math.PI) / 180

// Área (m²) de um anel lon/lat, em projeção equiretangular local — precisa para polígonos pequenos.
function areaM2(ring) {
  const lat0 = ring.reduce((s, [, la]) => s + la, 0) / ring.length
  const pts = ring.map(([lo, la]) => [rad(lo) * Math.cos(rad(lat0)) * R, rad(la) * R])
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

function centroid(ring) {
  const n = ring.length
  return [ring.reduce((s, [lo]) => s + lo, 0) / n, ring.reduce((s, [, la]) => s + la, 0) / n]
}

const mime = (n) => (/\.png$/i.test(n) ? 'image/png' : 'image/jpeg')

// Lê um .kmz/.kml e devolve os itens (placemarks) com polígono, data, fotos e área.
export function parseKmz(buffer, fileName = '') {
  let kml
  const files = {}
  if (/\.kml$/i.test(fileName)) kml = strFromU8(new Uint8Array(buffer))
  else {
    const zip = unzipSync(new Uint8Array(buffer))
    Object.assign(files, zip)
    const key = Object.keys(zip).find((k) => /(^|\/)doc\.kml$/i.test(k)) || Object.keys(zip).find((k) => /\.kml$/i.test(k))
    if (!key) throw new Error('O arquivo não contém um KML.')
    kml = strFromU8(zip[key])
  }
  const xml = new DOMParser().parseFromString(kml, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('KML inválido.')

  const txt = (el, tag) => el.getElementsByTagName(tag)[0]?.textContent?.trim() || ''
  const items = []
  for (const pm of xml.getElementsByTagName('Placemark')) {
    const raw = txt(pm, 'coordinates')
    const ring = raw.split(/\s+/).filter(Boolean).map((c) => c.split(',').map(Number)).filter((c) => c.length >= 2 && c.every(Number.isFinite))
    if (!ring.length) continue
    const poly = pm.getElementsByTagName('Polygon').length > 0 && ring.length >= 4
    if (poly && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop()
    const [lon, lat] = poly ? centroid(ring) : ring[0]

    const html = [...pm.getElementsByTagName('Data')].map((d) => txt(d, 'value')).join('\n') + txt(pm, 'description')
    const photos = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .filter((src) => files[src])
      .map((src) => {
        const name = src.split('/').pop()
        const file = new File([files[src]], name, { type: mime(name) })
        return { name, file, preview: URL.createObjectURL(file) }
      })

    items.push({
      nome: txt(pm, 'name') || `Item ${items.length + 1}`,
      data: (txt(pm, 'when') || '').slice(0, 10),
      lat, lon,
      vertices: ring.length,
      area: poly ? areaM2(ring) : null,
      photos,
    })
  }
  if (!items.length) throw new Error('Nenhum item com coordenadas foi encontrado no arquivo.')
  // Ordem numérica pelo nome (1, 2, 3…), como numerados em campo.
  return items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
}

// Endereço aproximado a partir das coordenadas (OpenStreetMap/Nominatim). Falha em silêncio.
export async function reverseGeocode(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lon}`)
    if (!r.ok) return null
    const a = (await r.json()).address || {}
    return {
      logradouro: a.road || a.pedestrian || a.path || '',
      bairro: a.suburb || a.neighbourhood || a.quarter || a.city_district || '',
      municipio: a.city || a.town || a.village || a.municipality || '',
      uf: (a['ISO3166-2-lvl4'] || '').split('-')[1] || '',
    }
  } catch {
    return null
  }
}
