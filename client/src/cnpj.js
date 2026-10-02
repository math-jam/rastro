export const onlyDigits = (v) => String(v || '').replace(/\D/g, '')

export function cnpjValido(v) {
  const c = onlyDigits(v)
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const dv = (n) => {
    let soma = 0, peso = n - 7
    for (let i = 0; i < n; i++) { soma += +c[i] * peso--; if (peso < 2) peso = 9 }
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === +c[12] && dv(13) === +c[13]
}

export const maskCnpj = (v) =>
  onlyDigits(v).slice(0, 14).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')

export const maskCep = (v) => onlyDigits(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2')

export const maskTel = (v) => {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}
