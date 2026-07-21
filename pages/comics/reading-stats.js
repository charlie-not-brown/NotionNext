import BLOG from '@/blog.config'
import ComicReadingStats from '@/components/comic-stats/ComicReadingStats'
import { ComicAuthProvider } from '@/components/comic-list/ComicAuthContext'
import { siteConfig } from '@/lib/config'
import { buildComicCatalog, getCollectionRowIds } from '@/lib/comic/getComicCatalog'
import { fetchGlobalAllData } from '@/lib/db/SiteDataApi'
import {
  fetchInBatches,
  fetchNotionPageBlocks
} from '@/lib/db/notion/getPostBlocks'

const ReadingStatsPage = ({ comicCatalog }) => {
  return (
    <ComicAuthProvider>
      <ComicReadingStats comicCatalog={comicCatalog} />
    </ComicAuthProvider>
  )
}

export async function getStaticProps({ locale }) {
  const props = await fetchGlobalAllData({
    from: 'comic-reading-stats-props',
    locale
  })

  const readingPageId = siteConfig(
    'COMIC_READING_PAGE_ID',
    '',
    props.NOTION_CONFIG
  )
  const databaseIds = siteConfig(
    'COMIC_DATABASE_IDS',
    [],
    props.NOTION_CONFIG
  )

  let comicCatalog = []

  try {
    const recordMap = await fetchNotionPageBlocks(
      readingPageId,
      'comic-reading-stats-catalog',
      { cacheVersion: 'comic-stats-covers-v2' }
    )

    if (recordMap) {
      const rowIds = getCollectionRowIds(recordMap, databaseIds)
      const existingIds = new Set(
        Object.keys(recordMap.block || {}).map(id =>
          String(id).replace(/-/g, '').toLowerCase()
        )
      )
      const missingIds = rowIds.filter(id => !existingIds.has(id))

      if (missingIds.length > 0) {
        const fetchedBlocks = await fetchInBatches(missingIds)
        recordMap.block = {
          ...(recordMap.block || {}),
          ...fetchedBlocks
        }
      }

      comicCatalog = buildComicCatalog(recordMap, databaseIds)
    }
  } catch (error) {
    console.warn(
      '[reading-stats] comic catalog failed:',
      error?.message || error
    )
  }

  props.comicCatalog = comicCatalog
  props.post = {
    id: 'comic-reading-stats',
    title: '阅读统计',
    summary: '漫画阅读状态、完成日历与阅读时长统计',
    slug: 'comics/reading-stats',
    type: 'Page',
    status: 'Published'
  }

  return {
    props,
    revalidate: process.env.EXPORT
      ? undefined
      : siteConfig(
          'NEXT_REVALIDATE_SECOND',
          BLOG.NEXT_REVALIDATE_SECOND,
          props.NOTION_CONFIG
        )
  }
}

export default ReadingStatsPage
