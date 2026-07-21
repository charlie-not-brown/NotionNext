import net from 'node:net'

const isPrivateIpv4 = address => {
  const parts = address.split('.').map(Number)

  if (parts.length !== 4 || parts.some(Number.isNaN)) return true

  const [a, b] = parts

  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

const isSafeRemoteUrl = rawUrl => {
  let url

  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (!['http:', 'https:'].includes(url.protocol)) return false

  const hostname = url.hostname.toLowerCase()

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return false
  }

  const ipVersion = net.isIP(hostname)

  if (ipVersion === 4 && isPrivateIpv4(hostname)) return false
  if (ipVersion === 6 && (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd'))) {
    return false
  }

  return true
}

const fetchWithValidatedRedirects = async initialUrl => {
  let currentUrl = initialUrl

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!isSafeRemoteUrl(currentUrl)) {
      throw new Error('Unsupported image URL')
    }

    const response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'user-agent': 'NotionNext Comic Cover Proxy'
      }
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Invalid image redirect')
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    return response
  }

  throw new Error('Too many image redirects')
}

export default async function handler(req, res) {
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url

  if (!rawUrl || !isSafeRemoteUrl(rawUrl)) {
    res.status(400).json({ error: 'Invalid image URL' })
    return
  }

  try {
    const response = await fetchWithValidatedRedirects(rawUrl)
    const contentType = response.headers.get('content-type') || ''

    if (!response.ok || !contentType.startsWith('image/')) {
      res.status(404).end()
      return
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    res.setHeader('Content-Type', contentType)
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000'
    )
    res.status(200).send(buffer)
  } catch (error) {
    console.warn('[comic-cover] image proxy failed:', error?.message || error)
    res.status(404).end()
  }
}
