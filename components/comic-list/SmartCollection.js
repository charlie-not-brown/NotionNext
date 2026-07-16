import { siteConfig } from '@/lib/config'
import { getBlockCollectionId } from 'notion-utils'

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

  /*
   * 防止配置因为环境变量等原因
   * 不是数组。
   */
  const targetDatabaseIds =
    Array.isArray(configuredDatabaseIds)
      ? configuredDatabaseIds.map(
          normalizeNotionId
        )
      : []

  /*
   * 从当前数据库块中读取
   * 它实际连接的数据库 ID。
   */
  const currentDatabaseId =
    normalizeNotionId(
      getBlockCollectionId(
        block,
        ctx?.recordMap
      )
    )

  const isTargetPage =
    normalizeNotionId(pageId) ===
    targetPageId

  const isTargetDatabase =
    targetDatabaseIds.includes(
      currentDatabaseId
    )

  const isComicCollection =
    isTargetPage &&
    isTargetDatabase

  if (
    typeof window !== 'undefined' &&
    isComicCollection
  ) {
    console.log(
      '[SmartCollection] 已识别漫画数据库',
    {
        pageId:
          normalizeNotionId(pageId),
        databaseId:
          currentDatabaseId
    }
  )
}

  /*
   * 当前阶段只完成识别，
   * 仍然使用原版数据库渲染。
   *
   * 下一阶段才会把目标数据库
   * 换成自定义 React 表格。
   */
  return (
    <OriginalCollection
      block={block}
      ctx={ctx}
      {...collectionProps}
    />
  )
}

export default SmartCollection