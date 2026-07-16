import { siteConfig } from '@/lib/config'
import { getBlockCollectionId } from 'notion-utils'
import ComicCollectionTable from './ComicCollectionTable'

/**
 * 统一 Notion ID 格式：
 * 删除横杠并转成小写。
 */
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
  const targetPageId =
    normalizeNotionId(
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
    Array.isArray(
      configuredDatabaseIds
    )
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

  const isComicCollection =
    isTargetPage &&
    isTargetDatabase

  /*
   * 普通数据库继续使用原版组件。
   */
  if (!isComicCollection) {
    return (
      <OriginalCollection
        block={block}
        ctx={ctx}
        {...collectionProps}
      />
    )
  }

  /*
   * 三个目标漫画数据库进入
   * ComicCollectionTable。
   */
  return (
    <ComicCollectionTable
      OriginalCollection={
        OriginalCollection
      }
      block={block}
      ctx={ctx}
      {...collectionProps}
    />
  )
}

export default SmartCollection