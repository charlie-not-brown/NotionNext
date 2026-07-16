import { siteConfig } from '@/lib/config'
import { getBlockCollectionId } from 'notion-utils'
import ComicCollectionTable from './ComicCollectionTable'

const normalizeNotionId = id => {
  return String(id || '')
    .replace(/-/g, '')
    .toLowerCase()
}

const SmartCollection = ({
  OriginalCollection,
  pageId,
  block,
  ctx,
  ...collectionProps
}) => {
  const targetPageId = normalizeNotionId(
    siteConfig('COMIC_READING_PAGE_ID', '')
  )

  const configuredDatabaseIds = siteConfig(
    'COMIC_DATABASE_IDS',
    []
  )

  const targetDatabaseIds = Array.isArray(
    configuredDatabaseIds
  )
    ? configuredDatabaseIds.map(normalizeNotionId)
    : []

  const currentPageId = normalizeNotionId(pageId)

  const currentDatabaseId = normalizeNotionId(
    getBlockCollectionId(
      block,
      ctx?.recordMap
    )
  )

  const isComicCollection =
    currentPageId === targetPageId &&
    targetDatabaseIds.includes(
      currentDatabaseId
    )

  if (!isComicCollection) {
    return (
      <OriginalCollection
        block={block}
        ctx={ctx}
        {...collectionProps}
      />
    )
  }

  return (
    <ComicCollectionTable
      OriginalCollection={OriginalCollection}
      databaseId={currentDatabaseId}
      block={block}
      ctx={ctx}
      {...collectionProps}
    />
  )
}

export default SmartCollection
