import { siteConfig } from '@/lib/config'
import { compressImage, mapImgUrl } from '@/lib/db/notion/mapImage'
import NotionLink from '@/components/NotionLink'
import { isBrowser, loadExternalResource } from '@/lib/utils'
import mediumZoom from '@fisch0920/medium-zoom'
import 'katex/dist/katex.min.css'
import dynamic from 'next/dynamic'
import { useEffect, useRef } from 'react'
import { NotionRenderer, useNotionContext } from 'react-notion-x'
import ComicReadTableEnhancer from '@/components/ComicReadTableEnhancer'

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

  // const cleanBlockMap = cleanBlocksWithWarn(post?.blockMap);
  // console.log('NotionPage render with post:', post);

  return (
    <div
      id='notion-article'
      className={`mx-auto overflow-hidden ${className || ''}`}>
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

      <ComicReadTableEnhancer enabled={true} />

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

const Collection = dynamic(
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
