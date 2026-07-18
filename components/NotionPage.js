import { siteConfig } from '@/lib/config'
import { compressImage, mapImgUrl } from '@/lib/db/notion/mapImage'
import NotionLink from '@/components/NotionLink'
import SmartCollection from '@/components/comic-list/SmartCollection'
import { isBrowser, loadExternalResource } from '@/lib/utils'
import mediumZoom from '@fisch0920/medium-zoom'
import 'katex/dist/katex.min.css'
import dynamic from 'next/dynamic'
import { useEffect, useRef } from 'react'
import { NotionRenderer, useNotionContext } from 'react-notion-x'
import {ComicAuthProvider} from '@/components/comic-list/ComicAuthContext'
import ComicAuthPanel from '@/components/comic-list/ComicAuthPanel'

/**
 * Notion 自定义 Emoji 映射表
 *
 * 左边：Notion Custom Emoji ID
 * 右边：本站 public 目录下的图片路径
 */
const CUSTOM_EMOJI_MAP = {
  // Cassandra Cain
  '2c9ff97e-5407-80f8-b7b0-007a6f023039':
    '/images/notion-icons/cassandra.webp',

  // Batman 1
  '2c8ff97e-5407-80f0-8662-007a9845c472':
    '/images/notion-icons/batman1.webp',

  // Batman Logo 2000-2011
  '2c9ff97e-5407-8025-9136-007a7c20940b':
    '/images/notion-icons/Batman-Logo-2000-2011.webp',

  // Detective Comics
  '2c9ff97e-5407-80e6-b0c3-007adaecfbdd':
    '/images/notion-icons/Detective-Comics.webp',

  // Nightwing
  '2c9ff97e-5407-80d0-ad42-007a33a9fa94':
    '/images/notion-icons/nightwing.webp',

  // Red Robin
  '2c8ff97e-5407-80ae-be28-007af2cfeac4':
    '/images/notion-icons/red-robin.webp',

  // Robin - Tim Drake
  '2c8ff97e-5407-80bd-8830-007a8ec587ab':
    '/images/notion-icons/robin-timdrake.webp',

  // Teen Titans
  '2caff97e-5407-8031-9797-007a0febd278':
    '/images/notion-icons/Teen-Titans.webp',

  // Teen Titans 2
  '2c9ff97e-5407-803d-a9ed-007ad2083d1d':
    '/images/notion-icons/Teen-Titans2.webp',

  // Young Justice
  '2c8ff97e-5407-8028-91ec-007a048af5f8':
    '/images/notion-icons/yj.webp',

  // Young Justice V3
  '2caff97e-5407-8072-b1a0-007aa8e9f049':
    '/images/notion-icons/yj-v3.webp'
}

/**
 * 专门处理 Notion 自定义 Emoji。
 *
 * 普通图片继续交给原有的 mapImgUrl；
 * notion://custom_emoji/ 地址则提取 Emoji ID，
 * 再替换成本站 public 目录中的图片。
 */
const mapNotionImageUrl = (img, block) => {
  if (
    typeof img === 'string' &&
    img.startsWith('notion://custom_emoji/')
  ) {
    const match = img.match(
      /^notion:\/\/custom_emoji\/[^/]+\/([^?]+)/
    )

    const emojiId = match?.[1]

    if (emojiId && CUSTOM_EMOJI_MAP[emojiId]) {
      return CUSTOM_EMOJI_MAP[emojiId]
    }
  }

  return mapImgUrl(img, block)
}

/**
 * 统一 Notion 页面 ID 的格式。
 *
 * Notion 页面 ID 有时带短横线，有时不带；
 * 这里统一移除短横线并转成小写，
 * 方便准确判断当前是不是漫画清单页面。
 */
const normalizeNotionId = id => {
  return String(id || '')
    .replace(/-/g, '')
    .toLowerCase()
}

/**
 * 整个站点的核心组件
 * 将Notion数据渲染成网页
 * @param {*} param0
 * @returns
 */
/**
 * 修复 react-notion-x 7.10.0 的 Notion Button 动作解析问题。
 *
 * Notion 的 automation / automation_action 数据可能存在
 * value.value 双层甚至更多层包装，而 7.10.0 只读取一层 value。
 * 这里提前递归解包，再恢复成 react-notion-x 7.10.0 能识别的一层结构。
 */
const unwrapNotionValue = record => {
  if (!record) return record

  if (
    typeof record === 'object' &&
    Object.prototype.hasOwnProperty.call(record, 'value')
  ) {
    return unwrapNotionValue(record.value)
  }

  return record
}

const normalizeNotionButtonActions = blockMap => {
  if (!blockMap) return blockMap

  const normalizeTable = table => {
    if (!table) return table

    return Object.fromEntries(
      Object.entries(table).map(([id, record]) => [
        id,
        {
          ...record,
          value: unwrapNotionValue(record)
        }
      ])
    )
  }

  return {
    ...blockMap,
    automation: normalizeTable(blockMap.automation),
    automation_action: normalizeTable(blockMap.automation_action)
  }
}

const NotionPage = ({ post, className }) => {
  // 是否关闭数据库和画册的点击跳转
  const POST_DISABLE_GALLERY_CLICK = siteConfig('POST_DISABLE_GALLERY_CLICK')
  const POST_DISABLE_DATABASE_CLICK = siteConfig('POST_DISABLE_DATABASE_CLICK')
  const SPOILER_TEXT_TAG = siteConfig('SPOILER_TEXT_TAG')

  // 修复 Notion Button 的 automation / automation_action 双层 value 包装
  const notionRecordMap = normalizeNotionButtonActions(post?.blockMap)

    /**
   * 判断当前文章是否为漫画阅读清单页。
   *
   * 只有该页面会显示注册、登录和退出面板，
   * 其他文章继续保持原来的渲染方式。
   */
  const isComicReadingPage =
    normalizeNotionId(post?.id) ===
    normalizeNotionId(
      siteConfig(
        'COMIC_READING_PAGE_ID',
        ''
      )
    )

  const zoomRef = useRef(null)
  const IMAGE_ZOOM_IN_WIDTH = siteConfig('IMAGE_ZOOM_IN_WIDTH', 1200)
  // 页面首次打开时执行的勾子
  useEffect(() => {
    // 检测当前的url并自动滚动到对应目标
    autoScrollToHash()
  }, [])

  // 页面文章发生变化时会执行的勾子
  useEffect(() => {
    // 相册视图点击禁止跳转，只能放大查看图片
    if (POST_DISABLE_GALLERY_CLICK) {
      if (!zoomRef.current && isBrowser) {
        zoomRef.current = mediumZoom({
          background: 'rgba(0, 0, 0, 0.2)',
          margin: getMediumZoomMargin()
        })
      }
      // 针对页面中的gallery视图，点击后是放大图片还是跳转到gallery的内部页面
      processGalleryImg(zoomRef?.current)
    }

    // 页内数据库点击禁止跳转，只能查看
    if (POST_DISABLE_DATABASE_CLICK) {
      processDisableDatabaseUrl()
    }

    /**
     * 放大查看图片时替换成高清图像
     */
    const articleRoot =
      document.getElementById('notion-article') || document.body
    const hasAnyImage = Boolean(articleRoot.querySelector('img'))
    if (!hasAnyImage) {
      return
    }

    const observer = new MutationObserver((mutationsList, observer) => {
      mutationsList.forEach(mutation => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class'
        ) {
          if (mutation.target.classList.contains('medium-zoom-image--opened')) {
            // 等待动画完成后替换为更高清的图像
            setTimeout(() => {
              // 获取该元素的 src 属性
              const src = mutation?.target?.getAttribute('src')
              //   替换为更高清的图像
              mutation?.target?.setAttribute(
                'src',
                compressImage(src, IMAGE_ZOOM_IN_WIDTH)
              )
            }, 800)
          }
        }
      })
    })

    // 监视正文容器，避免对整个 document.body 做高开销监听
    observer.observe(articleRoot, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class']
    })

    return () => {
      observer.disconnect()
    }
  }, [post])

  useEffect(() => {
    // Spoiler文本功能
    if (SPOILER_TEXT_TAG) {
      import('lodash/escapeRegExp').then(escapeRegExp => {
        Promise.all([
          loadExternalResource('/js/spoilerText.js', 'js'),
          loadExternalResource('/css/spoiler-text.css', 'css')
        ]).then(() => {
          window.textToSpoiler &&
            window.textToSpoiler(escapeRegExp.default(SPOILER_TEXT_TAG))
        })
      })
    }
  }, [post])

    /**
   * 将“带链接的行内代码”识别为前端按钮。
   *
   * Notion 中的使用方法：
   * 1. 选中文字并添加链接
   * 2. 保持选中，按 Ctrl + E 设置为行内代码
   *
   * 普通段落中：显示为行内按钮
   * 一级标题中：自动显示在标题右侧
   */
  useEffect(() => {
    if (!isBrowser) return

    const articleRoot = document.getElementById('notion-article')
    if (!articleRoot) return

    const decorateInlineActions = () => {
      const links = articleRoot.querySelectorAll('a')

      links.forEach(link => {
        /**
         * react-notion-x 根据富文本格式顺序不同，
         * 最终可能生成：
         *
         * <a><code>按钮</code></a>
         *
         * 或：
         *
         * <code><a>按钮</a></code>
         *
         * 所以两种结构都需要识别。
         */
        const inlineCode =
          link.querySelector('code') || link.closest('code')

        /**
         * 没有行内代码格式时保持普通链接。
         *
         * 如果它属于完整代码块，也不转换为按钮，
         * 避免影响文章中的代码展示。
         */
        if (!inlineCode || inlineCode.closest('.notion-code')) return

        link.classList.add('notion-inline-action')
        inlineCode.classList.add('notion-inline-action-code')

        /**
         * Notion 的一级标题通常带有 .notion-h1。
         * 同时兼容直接使用 h1 标签的情况。
         */
        const heading = link.closest('.notion-h1, h1')

        if (heading) {
          heading.classList.add('notion-heading-with-action')
          link.classList.add('notion-heading-action')
        }
      })
    }

    /**
     * 首次渲染后立即处理。
     */
    decorateInlineActions()

    /**
     * 部分 Notion 内容可能稍后才插入页面，
     * 因此监听正文节点变化，再补做一次识别。
     */
    const observer = new MutationObserver(decorateInlineActions)

    observer.observe(articleRoot, {
      childList: true,
      subtree: true
    })

    return () => {
      observer.disconnect()
    }
  }, [post])

  // const cleanBlockMap = cleanBlocksWithWarn(post?.blockMap);
  // console.log('NotionPage render with post:', post);

  /**
   * 所有 Notion 数据库先经过 SmartCollection。
   *
   * SmartCollection 负责判断：
   * - 普通数据库：继续使用 OriginalCollection
   * - 漫画数据库：加入阅读状态功能
   */
  const Collection = collectionProps => {
    return (
      <SmartCollection
        {...collectionProps}
        pageId={post?.id}
        OriginalCollection={OriginalCollection}
      />
    )
  }

  /**
   * 保留原来的 NotionRenderer 配置。
   *
   * 漫画清单页会把它放进登录状态 Provider；
   * 普通文章仍然直接使用原来的渲染结果。
   */
  const notionRenderer = (
    <NotionRenderer
      recordMap={notionRecordMap}
      mapPageUrl={mapPageUrl}
      mapImageUrl={mapNotionImageUrl}
      components={{
        Code,
        Collection,
        Embed: NotionEmbed,
        Equation,
        Link: NotionLink,
        Modal,
        Pdf,
        Quote: NotionQuote,
        Tweet
      }}
    />
  )

  return (
    <div
      id='notion-article'
      className={`mx-auto overflow-hidden ${className || ''}`}>

      {isComicReadingPage ? (
        <ComicAuthProvider>
          <ComicAuthPanel />
          {notionRenderer}
        </ComicAuthProvider>
      ) : (
        notionRenderer
      )}

      <AdEmbed />
      {hasCodeBlock(post?.blockMap) && <PrismMac />}
    </div>
  )
}

const hasCodeBlock = blockMap => {
  const blocks = blockMap?.block
  if (!blocks) return false
  return Object.values(blocks).some(
    item => item?.value?.type === 'code'
  )
}

const NotionEmbed = ({ block }) => {
  const { recordMap } = useNotionContext()
  const source =
    recordMap?.signed_urls?.[block?.id] ||
    block?.format?.display_source ||
    block?.properties?.source?.[0]?.[0]
  const isHtmlArtifact =
    block?.type === 'embed' && block?.format?.embed_variant === 'html_artifact'
  const srcDoc = isHtmlArtifact
    ? block?.format?.html_artifact_content
    : undefined

  if (!srcDoc && (!source || source.startsWith('attachment:'))) return null

  const height = block?.format?.block_height || (isHtmlArtifact ? 640 : 480)
  const title =
    block?.properties?.title?.[0]?.[0] ||
    (isHtmlArtifact ? 'Notion HTML block' : 'iframe embed')

  return (
    <figure
      className='notion-asset-wrapper notion-asset-wrapper-embed'
      >
      <div style={{ height, position: 'relative' }}>
        <iframe
          className='notion-asset-object-fit'
          src={srcDoc ? undefined : source}
          srcDoc={srcDoc}
          title={title}
          frameBorder='0'
          loading='lazy'
          scrolling='auto'
          allowFullScreen={!isHtmlArtifact}
          sandbox={
            isHtmlArtifact ? 'allow-scripts allow-forms allow-popups' : undefined
          }
        />
      </div>
    </figure>
  )
}


/**
 * 页面的数据库链接禁止跳转，只能查看
 */
const processDisableDatabaseUrl = () => {
  if (isBrowser) {
    const links = document.querySelectorAll('.notion-table a')
    for (const e of links) {
      e.removeAttribute('href')
    }
  }
}

/**
 * gallery视图，点击后是放大图片还是跳转到gallery的内部页面
 */
const processGalleryImg = zoom => {
  setTimeout(() => {
    if (isBrowser) {
      const imgList = document?.querySelectorAll(
        '.notion-collection-card-cover img'
      )
      if (imgList && zoom) {
        for (let i = 0; i < imgList.length; i++) {
          zoom.attach(imgList[i])
        }
      }

      const cards = document.getElementsByClassName('notion-collection-card')
      for (const e of cards) {
        e.removeAttribute('href')
      }
    }
  }, 800)
}

/**
 * 根据url参数自动滚动到锚位置
 */
const autoScrollToHash = () => {
  setTimeout(() => {
    // 跳转到指定标题
    const hash = window?.location?.hash
    const needToJumpToTitle = hash && hash.length > 0
    if (needToJumpToTitle) {
      console.log('jump to hash', hash)
      const tocNode = document.getElementById(hash.substring(1))
      if (tocNode && tocNode?.className?.indexOf('notion') > -1) {
        tocNode.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }
    }
  }, 180)
}

/**
 * 将id映射成博文内部链接。
 * @param {*} id
 * @returns
 */
const mapPageUrl = id => {
  // return 'https://www.notion.so/' + id.replace(/-/g, '')
  return '/' + id.replace(/-/g, '')
}

/**
 * 缩放
 * @returns
 */
function getMediumZoomMargin() {
  const width = window.innerWidth

  if (width < 500) {
    return 8
  } else if (width < 800) {
    return 20
  } else if (width < 1280) {
    return 30
  } else if (width < 1600) {
    return 40
  } else if (width < 1920) {
    return 48
  } else {
    return 72
  }
}

// 代码
const Code = dynamic(
  () =>
    import('react-notion-x/build/third-party/code').then(m => {
      return m.Code
    }),
  { ssr: false }
)

// 公式
const Equation = dynamic(
  () =>
    import('@/components/Equation').then(async m => {
      // 化学方程式
      await import('@/lib/plugins/mhchem')
      return m.Equation
    }),
  { ssr: true }
)

// 原版文档
// const Pdf = dynamic(
//   () => import('react-notion-x/build/third-party/pdf').then(m => m.Pdf),
//   {
//     ssr: false
//   }
// )
const Pdf = dynamic(() => import('@/components/Pdf').then(m => m.Pdf), {
  ssr: false
})

// 美化代码 from: https://github.com/txs
const PrismMac = dynamic(() => import('@/components/PrismMac'), {
  ssr: false
})

/**
 * tweet嵌入
 */
const TweetEmbed = dynamic(() => import('react-tweet-embed'), {
  ssr: false
})

/**
 * 文内google广告
 */
const AdEmbed = dynamic(
  () => import('@/components/GoogleAdsense').then(m => m.AdEmbed),
  { ssr: true }
)

const OriginalCollection = dynamic(
  () =>
    import('react-notion-x/build/third-party/collection').then(
      m => m.Collection
    ),
  {
    ssr: true
  }
)

const Modal = dynamic(
  () => import('react-notion-x/build/third-party/modal').then(m => m.Modal),
  { ssr: false }
)

const Tweet = ({ id }) => {
  return <TweetEmbed tweetId={id} />
}

// Custom Quote override: react-notion-x drops quotes without properties.title
// (returns null from early guard). This renders them correctly — fixes #4140.
const NotionQuote = ({ block, children }) => {
  const title = block?.properties?.title
  return (
    <blockquote className='notion-quote'>
      {title && <NotionText value={title} />}
      {children}
    </blockquote>
  )
}

// Minimal inline text renderer for Notion rich-text arrays.
// Each segment is [plainText, [[formatType, optionalValue], ...]].
const NotionText = ({ value }) => {
  if (!Array.isArray(value)) return null
  return value.map((segment, i) => {
    if (!Array.isArray(segment) || !segment[0]) return null
    const [text, formats] = segment
    let element = <>{text}</>
    if (Array.isArray(formats)) {
      for (const fmt of formats) {
        const type = Array.isArray(fmt) ? fmt[0] : fmt
        if (type === 'b') element = <strong>{element}</strong>
        else if (type === 'i') element = <em>{element}</em>
        else if (type === 's') element = <s>{element}</s>
        else if (type === 'c') element = <code>{element}</code>
        else if (type === 'a') element = <a href={Array.isArray(fmt) ? fmt[1] : '#'}>{element}</a>
      }
    }
    return <span key={i}>{element}</span>
  })
}

export default NotionPage
