import { mapImgUrl } from '@/lib/db/notion/mapImage'

const normalizeNotionId = value =>
  String(value || '')
    .replace(/-/g, '')
    .toLowerCase()

const unwrapRecord = entry =>
  entry?.value?.value || entry?.value || entry || null

const propertyToText = property => {
  if (!property) return ''

  if (typeof property === 'string') {
    return property
  }

  if (!Array.isArray(property)) {
    return ''
  }

  return property
    .map(segment => {
      if (typeof segment === 'string') return segment
      if (!Array.isArray(segment)) return ''

      const first = segment[0]
      return typeof first === 'string' ? first : propertyToText(first)
    })
    .join('')
    .trim()
}

const findFirstFileSource = value => {
  if (!value) return null

  if (typeof value === 'string') {
    const normalized = value.trim()

    if (
      normalized.startsWith('http://') ||
      normalized.startsWith('https://') ||
      normalized.startsWith('/') ||
      normalized.startsWith('attachment:')
    ) {
      return normalized
    }

    return null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstFileSource(item)
      if (found) return found
    }

    return null
  }

  if (typeof value === 'object') {
    const directUrl =
      value.url ||
      value.src ||
      value.source ||
      value.external?.url ||
      value.file?.url

    const directFound = findFirstFileSource(directUrl)
    if (directFound) return directFound

    for (const item of Object.values(value)) {
      const found = findFirstFileSource(item)
      if (found) return found
    }
  }

  return null
}

const getCollectionValue = (recordMap, collectionId) => {
  const normalizedTarget = normalizeNotionId(collectionId)

  for (const [key, entry] of Object.entries(recordMap?.collection || {})) {
    const value = unwrapRecord(entry)
    const currentId = normalizeNotionId(value?.id || key)

    if (currentId === normalizedTarget) {
      return value
    }
  }

  return null
}

const getConfiguredCollectionIds = configuredIds => {
  if (Array.isArray(configuredIds)) {
    return configuredIds.map(normalizeNotionId).filter(Boolean)
  }

  return String(configuredIds || '')
    .split(',')
    .map(normalizeNotionId)
    .filter(Boolean)
}

export const getCollectionRowIds = (recordMap, configuredIds) => {
  const targetIds = new Set(getConfiguredCollectionIds(configuredIds))
  const rowIds = new Set()

  const walk = value => {
    if (!value) return

    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }

    if (typeof value !== 'object') return

    Object.entries(value).forEach(([key, child]) => {
      if (key === 'blockIds' && Array.isArray(child)) {
        child.forEach(id => {
          const normalized = normalizeNotionId(id)
          if (normalized) rowIds.add(normalized)
        })
        return
      }

      walk(child)
    })
  }

  Object.entries(recordMap?.collection_query || {}).forEach(
    ([collectionId, queryValue]) => {
      if (targetIds.has(normalizeNotionId(collectionId))) {
        walk(queryValue)
      }
    }
  )

  return Array.from(rowIds)
}

const createBlockLookup = blockMap => {
  const lookup = new Map()

  Object.entries(blockMap || {}).forEach(([key, entry]) => {
    const block = unwrapRecord(entry)
    const id = normalizeNotionId(block?.id || key)

    if (id) lookup.set(id, block)
  })

  return lookup
}

const findTitlePropertyId = schema =>
  Object.entries(schema || {}).find(
    ([, property]) => property?.type === 'title'
  )?.[0]

const findCoverPropertyIds = schema => {
  const entries = Object.entries(schema || {})

  const namedCoverIds = entries
    .filter(([, property]) =>
      String(property?.name || '')
        .trim()
        .includes('封面')
    )
    .map(([propertyId]) => propertyId)

  const filePropertyIds = entries
    .filter(([, property]) =>
      ['file', 'files'].includes(String(property?.type || '').toLowerCase())
    )
    .map(([propertyId]) => propertyId)

  return Array.from(new Set([...namedCoverIds, ...filePropertyIds]))
}

const findCoverSource = (block, coverPropertyIds) => {
  for (const propertyId of coverPropertyIds) {
    const found = findFirstFileSource(block?.properties?.[propertyId])
    if (found) return found
  }

  return findFirstFileSource(block?.format?.page_cover)
}

const resolveMappedCover = (recordMap, block, rawCover) => {
  if (!rawCover) return null

  const signedUrls = recordMap?.signed_urls || {}
  const signedCover =
    signedUrls[rawCover] ||
    signedUrls[block?.id] ||
    signedUrls[normalizeNotionId(block?.id)]

  if (signedCover) return signedCover

  return mapImgUrl(rawCover, block, 'block', false)
}

export const buildComicCatalog = (recordMap, configuredIds) => {
  const collectionIds = getConfiguredCollectionIds(configuredIds)
  const blockLookup = createBlockLookup(recordMap?.block)
  const result = []
  const seen = new Set()

  collectionIds.forEach(collectionId => {
    const collectionRowIds = new Set(
      getCollectionRowIds(recordMap, [collectionId])
    )
    const collection = getCollectionValue(recordMap, collectionId)
    const schema = collection?.schema || {}
    const titlePropertyId = findTitlePropertyId(schema)
    const coverPropertyIds = findCoverPropertyIds(schema)

    blockLookup.forEach(block => {
      const comicId = normalizeNotionId(block?.id)
      const parentId = normalizeNotionId(block?.parent_id)
      const belongsToCollection =
        parentId === collectionId || collectionRowIds.has(comicId)

      if (
        !comicId ||
        seen.has(comicId) ||
        block?.type !== 'page' ||
        !belongsToCollection
      ) {
        return
      }

      const title =
        propertyToText(block?.properties?.[titlePropertyId]) ||
        propertyToText(block?.properties?.title) ||
        '未命名漫画'

      const rawCover = findCoverSource(block, coverPropertyIds)
      const mappedCover = resolveMappedCover(recordMap, block, rawCover)

      result.push({
        comicId,
        title,
        cover: mappedCover || null,
        proxyCover: mappedCover
          ? `/api/comic-cover?url=${encodeURIComponent(mappedCover)}`
          : null
      })

      seen.add(comicId)
    })
  })

  return result.sort((left, right) =>
    left.title.localeCompare(right.title, 'zh-CN')
  )
}

export { normalizeNotionId }
