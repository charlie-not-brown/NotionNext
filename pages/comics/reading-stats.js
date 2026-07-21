import BLOG from '@/blog.config'
import Link from 'next/link'
import { useEffect } from 'react'
import ComicReadingStats from '@/components/comic-stats/ComicReadingStats'
import { ComicAuthProvider } from '@/components/comic-list/ComicAuthContext'
import { siteConfig } from '@/lib/config'
import {
  buildComicCatalog,
  getCollectionRowIds,
} from '@/lib/comic/getComicCatalog'
import { fetchGlobalAllData } from '@/lib/db/SiteDataApi'
import {
  fetchInBatches,
  fetchNotionPageBlocks,
} from '@/lib/db/notion/getPostBlocks'

const ReadingStatsPage = ({ comicCatalog }) => {
  useEffect(() => {
    let frameId = 0
    let timerId = 0

    const removeDuplicateEndspaceRoots = () => {
      const roots = Array.from(
        document.querySelectorAll('#theme-endspace'),
      )

      if (roots.length <= 1) return

      const currentRoot = roots[roots.length - 1]
      let removedDuplicate = false

      roots.slice(0, -1).forEach((root) => {
        if (
          root !== currentRoot &&
          root.parentNode
        ) {
          root.parentNode.removeChild(root)
          removedDuplicate = true
        }
      })

      if (removedDuplicate) {
        window.requestAnimationFrame(() => {
          window.scrollTo(0, 0)
        })
      }
    }

    frameId = window.requestAnimationFrame(
      removeDuplicateEndspaceRoots,
    )

    /*
     * 再检查一次，接住动态主题外壳稍晚挂载的情况。
     * 不是轮询，只执行这一次。
     */
    timerId = window.setTimeout(
      removeDuplicateEndspaceRoots,
      180,
    )

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timerId)
    }
  }, [])

  return (
    <ComicAuthProvider>
      <div className="w-full">
        <div className="mb-7">
          <Link
            href="/comics/reading-list"
            className="inline-flex items-center text-sm opacity-60 transition-opacity hover:opacity-100"
          >
            ← 返回阅读清单
          </Link>
        </div>

        <ComicReadingStats comicCatalog={comicCatalog} />
      </div>
    </ComicAuthProvider>
  )
}

export async function getStaticProps({ locale }) {
  const props = await fetchGlobalAllData({
    from: 'comic-reading-stats-props',
    locale,
  })

  const readingPageId = siteConfig(
    'COMIC_READING_PAGE_ID',
    '',
    props.NOTION_CONFIG,
  )
  const databaseIds = siteConfig('COMIC_DATABASE_IDS', [], props.NOTION_CONFIG)

  let comicCatalog = []

  try {
    const recordMap = await fetchNotionPageBlocks(
      readingPageId,
      'comic-reading-stats-catalog',
      { cacheVersion: 'comic-stats-covers-v3' },
    )

    if (recordMap) {
      const rowIds = getCollectionRowIds(recordMap, databaseIds)
      const existingIds = new Set(
        Object.keys(recordMap.block || {}).map((id) =>
          String(id).replace(/-/g, '').toLowerCase(),
        ),
      )
      const missingIds = rowIds.filter((id) => !existingIds.has(id))

      if (missingIds.length > 0) {
        const fetchedBlocks = await fetchInBatches(missingIds)
        recordMap.block = {
          ...(recordMap.block || {}),
          ...fetchedBlocks,
        }
      }

      comicCatalog = buildComicCatalog(recordMap, databaseIds)
    }
  } catch (error) {
    console.warn(
      '[reading-stats] comic catalog failed:',
      error?.message || error,
    )
  }

  props.comicCatalog = comicCatalog
  props.post = {
    id: 'comic-reading-stats',
    title: '阅读统计',
    summary: '漫画阅读状态、完成日历与阅读时长统计',
    slug: 'comics/reading-stats',
    type: 'Page',
    status: 'Published',
  }

  return {
    props,
    revalidate: process.env.EXPORT
      ? undefined
      : siteConfig(
          'NEXT_REVALIDATE_SECOND',
          BLOG.NEXT_REVALIDATE_SECOND,
          props.NOTION_CONFIG,
        ),
  }
}

export default ReadingStatsPage
