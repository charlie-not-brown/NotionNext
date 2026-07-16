import { useEffect } from 'react'

/**
 * 漫画阅读状态的本地存储 key。
 *
 * 目前只是测试版：
 * - 勾选状态保存在当前浏览器 localStorage
 * - 后续接入 Supabase 后，只需要替换读写数据的部分
 */
const STORAGE_KEY = 'notionnext-comic-read-status-v1'

/**
 * 读取当前浏览器已经保存的阅读状态。
 *
 * 最终格式类似：
 *
 * {
 *   "comic-page-id-1": true,
 *   "comic-page-id-2": true
 * }
 */
const getSavedReadState = () => {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)

    if (!saved) {
      return {}
    }

    const parsed = JSON.parse(saved)

    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    console.warn(
      '[ComicReadTableEnhancer] 读取阅读状态失败：',
      error
    )

    return {}
  }
}

/**
 * 保存某一本漫画的阅读状态。
 */
const saveReadState = (comicId, checked) => {
  if (typeof window === 'undefined' || !comicId) {
    return
  }

  try {
    const savedState = getSavedReadState()

    if (checked) {
      savedState[comicId] = true
    } else {
      /*
       * 未读状态不用专门保存 false，
       * 直接删除即可，减少 localStorage 数据量。
       */
      delete savedState[comicId]
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(savedState)
    )
  } catch (error) {
    console.warn(
      '[ComicReadTableEnhancer] 保存阅读状态失败：',
      error
    )
  }
}

/**
 * 从 react-notion-x 的 recordMap 中，
 * 自动读取当前嵌入数据库中的漫画 pageId。
 *
 * 不需要手动填写任何一条漫画的 ID。
 */
const getCollectionBlockIds = recordMap => {
  const collectionQueries = recordMap?.collection_query

  if (
    !collectionQueries ||
    typeof collectionQueries !== 'object'
  ) {
    return []
  }

  /*
   * collection_query 的结构大致是：
   *
   * collectionId
   *   └── viewId
   *         └── blockIds
   *
   * 我们自动找到页面里的数据库查询结果。
   */
  for (const viewMap of Object.values(collectionQueries)) {
    if (!viewMap || typeof viewMap !== 'object') {
      continue
    }

    for (const rawCollectionData of Object.values(viewMap)) {
      /*
       * 兼容可能存在的 value 包装。
       */
      const collectionData =
        rawCollectionData?.value ?? rawCollectionData

      const blockIds =
        collectionData?.collection_group_results?.blockIds ??
        collectionData?.blockIds

      if (Array.isArray(blockIds) && blockIds.length > 0) {
        return blockIds
      }
    }
  }

  return []
}

/**
 * 删除我们自己插入的阅读状态列。
 *
 * 用于：
 * - 页面切换
 * - 组件卸载
 * - 防止重复插入
 */
const removeExistingEnhancement = articleRoot => {
  if (!articleRoot) {
    return
  }

  articleRoot
    .querySelectorAll(
      [
        '[data-comic-read-header="true"]',
        '[data-comic-read-cell="true"]'
      ].join(',')
    )
    .forEach(element => {
      element.remove()
    })
}

/**
 * 为指定 Table 插入：
 *
 * 已读
 * ☐
 * ☑
 * ☐
 */
const enhanceComicTable = ({
  articleRoot,
  recordMap
}) => {
  if (!articleRoot) {
    return
  }

  /*
   * 获取漫画 pageId。
   *
   * 例如：
   *
   * [
   *   "abc123...",
   *   "def456...",
   *   "ghi789..."
   * ]
   */
  const blockIds = getCollectionBlockIds(recordMap)

  if (blockIds.length === 0) {
    return
  }

  /*
   * 你的目标页面目前是嵌入的数据库 Table。
   *
   * 第一版先选择这个页面中的第一个数据库 Table。
   * 以后页面里如果出现多个数据库，
   * 再改成按照 databaseId 精确指定即可。
   */
  const table = articleRoot.querySelector('.notion-table')

  if (!table) {
    return
  }

  const savedState = getSavedReadState()

  /*
   * ==========================================
   * 1. 增加表头：已读
   * ==========================================
   */
  const headerInner = table.querySelector(
    '.notion-table-header-inner'
  )

  if (
    headerInner &&
    !headerInner.querySelector(
      '[data-comic-read-header="true"]'
    )
  ) {
    const headerWrapper = document.createElement('div')

    headerWrapper.className =
      'notion-table-th comic-read-table-th'

    headerWrapper.dataset.comicReadHeader = 'true'

    const headerCell = document.createElement('div')

    headerCell.className =
      [
        'notion-table-view-header-cell',
        'comic-read-table-header-cell'
      ].join(' ')

    const headerCellInner = document.createElement('div')

    headerCellInner.className =
      'notion-table-view-header-cell-inner'

    headerCellInner.textContent = '已读'

    headerCell.appendChild(headerCellInner)
    headerWrapper.appendChild(headerCell)

    /*
     * prepend：
     * 插到漫画名称之前，
     * 成为最左边第一列。
     */
    headerInner.prepend(headerWrapper)
  }

  /*
   * ==========================================
   * 2. 给每一行增加 checkbox
   * ==========================================
   */
  const rows = table.querySelectorAll(
    '.notion-table-body > .notion-table-row'
  )

  rows.forEach((row, index) => {
    /*
     * react-notion-x 本身就是按照 blockIds 的顺序
     * 逐行渲染 Table，
     * 所以直接按照 index 对应即可。
     */
    const comicId = blockIds[index]

    if (!comicId) {
      return
    }

    /*
     * 防止 MutationObserver 或重新渲染导致重复插入。
     */
    if (
      row.querySelector(
        '[data-comic-read-cell="true"]'
      )
    ) {
      return
    }

    const cell = document.createElement('div')

    cell.className =
      [
        'notion-table-cell',
        'notion-table-cell-checkbox',
        'comic-read-table-cell'
      ].join(' ')

    cell.dataset.comicReadCell = 'true'
    cell.dataset.comicId = comicId

    const checkbox = document.createElement('input')

    checkbox.type = 'checkbox'
    checkbox.className = 'comic-read-checkbox'

    /*
     * 根据 localStorage 恢复状态。
     */
    checkbox.checked = savedState[comicId] === true

    checkbox.setAttribute(
      'aria-label',
      '标记这部漫画为已读'
    )

    checkbox.addEventListener('change', event => {
      saveReadState(
        comicId,
        event.currentTarget.checked
      )
    })

    cell.appendChild(checkbox)

    /*
     * 插到当前漫画行的最左边。
     */
    row.prepend(cell)
  })
}

/**
 * 漫画数据库阅读状态增强组件。
 *
 * props：
 *
 * post
 *   当前 NotionNext 文章数据
 *
 * enabled
 *   true  = 显示复选框
 *   false = 完全不显示
 *
 * targetSlug
 *   只允许指定文章启用
 */
const ComicReadTableEnhancer = ({
  post,
  enabled = false,
  targetSlug
}) => {
  useEffect(() => {
    /*
     * 未登录 / 未启用：
     * 完全不执行任何修改。
     */
    if (!enabled) {
      return
    }

    /*
     * 不是目标漫画清单文章：
     * 完全不执行任何修改。
     */
    if (
      targetSlug &&
      post?.slug !== targetSlug
    ) {
      return
    }

    const articleRoot = document.getElementById(
      'notion-article'
    )

    if (!articleRoot) {
      return
    }

    const runEnhancement = () => {
      enhanceComicTable({
        articleRoot,
        recordMap: post?.blockMap
      })
    }

    /*
     * 首次执行。
     *
     * requestAnimationFrame 可以确保
     * NotionRenderer 已经完成当前这一轮 DOM 渲染。
     */
    const animationFrameId =
      window.requestAnimationFrame(runEnhancement)

    /*
     * 监听数据库后续变化。
     *
     * 例如：
     * - 点击 Load more
     * - react-notion-x 重新渲染
     *
     * 新增的行也会自动获得 checkbox。
     */
    const observer = new MutationObserver(() => {
      runEnhancement()
    })

    observer.observe(articleRoot, {
      childList: true,
      subtree: true
    })

    return () => {
      window.cancelAnimationFrame(animationFrameId)

      observer.disconnect()

      removeExistingEnhancement(articleRoot)
    }
  }, [enabled, post, targetSlug])

  /*
   * 这里只输出样式。
   * checkbox 和表格单元格本身由上面的代码动态生成。
   */
  if (!enabled) {
    return null
  }

  return (
    <style jsx global>{`
      /*
       * ==========================================
       * 漫画阅读状态列
       * ==========================================
       */

      .comic-read-table-header-cell,
      .comic-read-table-cell {
        width: 64px !important;
        min-width: 64px !important;
        max-width: 64px !important;
        flex-shrink: 0;
      }

      .comic-read-table-header-cell {
        text-align: center;
      }

      .comic-read-table-header-cell
        .notion-table-view-header-cell-inner {
        justify-content: center;
      }

      .comic-read-table-cell {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /*
       * 使用浏览器原生 checkbox。
       *
       * 第一版先保证功能，
       * 后续可以再换成更符合 endspace 风格的样式。
       */
      .comic-read-checkbox {
        width: 16px;
        height: 16px;

        margin: 0;

        cursor: pointer;
      }
    `}</style>
  )
}

export default ComicReadTableEnhancer