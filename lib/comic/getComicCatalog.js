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

    const titlePropertyId = Object.entries(schema).find(
      ([, property]) => property?.type === 'title'
    )?.[0]

    const coverPropertyId = Object.entries(schema).find(([, property]) => {
      const name = String(property?.name || '').trim()
      return name === '封面' || name.includes('封面')
    })?.[0]

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

      const rawCover =
        findFirstFileSource(block?.properties?.[coverPropertyId]) ||
        findFirstFileSource(block?.format?.page_cover)

      const mappedCover = rawCover
        ? mapImgUrl(rawCover, block, 'block', false)
        : null

      result.push({
        comicId,
        title,
        cover: mappedCover
          ? `/api/comic-cover?url=${encodeURIComponent(mappedCover)}`
          : null
      })

      seen.add(comicId)
    })
  })

  return result.sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
}

export { normalizeNotionId }
