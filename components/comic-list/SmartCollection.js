import { siteConfig } from '@/lib/config'
import { getBlockCollectionId } from 'notion-utils'

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
    siteConfig(
      'COMIC_READING_PAGE_ID',
      ''
    )
  )

  const configuredDatabaseIds =
    siteConfig(
      'COMIC_DATABASE_IDS',
      []
    )

  const targetDatabaseIds =
    Array.isArray(configuredDatabaseIds)
      ? configuredDatabaseIds.map(
          normalizeNotionId
        )
      : []

  const currentPageId =
    normalizeNotionId(pageId)

  const currentDatabaseId =
    normalizeNotionId(
      getBlockCollectionId(
        block,
        ctx?.recordMap
      )
    )

  const isTargetPage =
    currentPageId === targetPageId

  const isTargetDatabase =
    targetDatabaseIds.includes(
      currentDatabaseId
    )

  if (
    typeof window !== 'undefined' &&
    isTargetPage &&
    isTargetDatabase
  ) {
    console.log(
      '[SmartCollection] 已识别漫画数据库',
      currentDatabaseId
    )
  }

  return (
    <OriginalCollection
      block={block}
      ctx={ctx}
      {...collectionProps}
    />
  )
}

export default SmartCollection