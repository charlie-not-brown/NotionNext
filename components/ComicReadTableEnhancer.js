import { useEffect } from 'react'

const STORAGE_KEY = 'notionnext-comic-read-status-v1'

const getSavedState = () => {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    return JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || '{}'
    )
  } catch (error) {
    console.warn(
      '[ComicReadTableEnhancer] 读取本地状态失败',
      error
    )

    return {}
  }
}

const saveState = (comicId, checked) => {
  try {
    const state = getSavedState()

    if (checked) {
      state[comicId] = true
    } else {
      delete state[comicId]
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    )
  } catch (error) {
    console.warn(
      '[ComicReadTableEnhancer] 保存本地状态失败',
      error
    )
  }
}

/**
 * 从行内链接自动提取漫画条目的 Notion pageId。
 *
 * 例如：
 * /2c9ff97e540780f8b7b0007a6f023039
 *
 * 会得到：
 * 2c9ff97e540780f8b7b0007a6f023039
 */
const getComicIdFromRow = (row, index) => {
  const link = row.querySelector('a[href]')

  if (link) {
    const href = link.getAttribute('href') || ''

    const path = href
      .split('?')[0]
      .split('#')[0]
      .replace(/^\/+/, '')

    const possibleId = path.split('/').pop()

    if (
      possibleId &&
      /^[a-f0-9]{32}$/i.test(possibleId)
    ) {
      return possibleId.toLowerCase()
    }
  }

  /*
   * 兼容链接已被 POST_DISABLE_DATABASE_CLICK 删除 href
   * 或暂时无法读取条目 ID 的情况。
   *
   * 先根据标题生成稳定标识。
   */
  const title =
    row
      .querySelector(
        [
          '.notion-table-cell-title',
          '.notion-property-title',
          '.notion-page-title-text',
          '.notion-page-title'
        ].join(',')
      )
      ?.textContent?.trim() ||
    row.textContent?.trim() ||
    `row-${index}`

  return `title-${title}`
}

const removeEnhancement = root => {
  root
    ?.querySelectorAll(
      [
        '[data-comic-read-header]',
        '[data-comic-read-cell]'
      ].join(',')
    )
    .forEach(element => element.remove())
}

const enhanceTable = root => {
  /*
   * 找到文章里第一个 Table 数据库。
   */
  const table = root.querySelector('.notion-table')

  if (!table) {
    console.log(
      '[ComicReadTableEnhancer] 没找到 .notion-table'
    )

    return false
  }

  /*
   * react-notion-x 当前表格行。
   *
   * 不再依赖 .notion-table-body，
   * 直接查找整个 Table 内的所有 row。
   */
  /*
 * react-notion-x 的表头和数据行是两套独立结构：
 *
 * 表头：
 * .notion-table-header-inner
 *
 * 数据行：
 * .notion-table-body > .notion-table-row
 */
const headerInner = table.querySelector(
  '.notion-table-header-inner'
)

const dataRows = Array.from(
  table.querySelectorAll(
    '.notion-table-body > .notion-table-row'
  )
)

if (!headerInner || dataRows.length === 0) {
  console.log(
    '[ComicReadTableEnhancer] 表格结构不完整',
    {
      hasHeader: Boolean(headerInner),
      rowCount: dataRows.length
    }
  )

  return false
}

const savedState = getSavedState()

/*
 * 给真正的表头增加“已读”列。
 *
 * 必须使用与 react-notion-x 原表头相同的三层结构，
 * 才能与下面的数据单元格对齐。
 */
if (
  !headerInner.querySelector(
    '[data-comic-read-header]'
  )
) {
  const headerWrapper =
    document.createElement('div')

  headerWrapper.className =
    'notion-table-th comic-read-table-th'

  headerWrapper.dataset.comicReadHeader = 'true'

  const headerCell =
    document.createElement('div')

  headerCell.className =
    [
      'notion-table-view-header-cell',
      'comic-read-table-header-cell'
    ].join(' ')

  const headerCellInner =
    document.createElement('div')

  headerCellInner.className =
    'notion-table-view-header-cell-inner'

  headerCellInner.textContent = '已读'

  headerCell.appendChild(headerCellInner)
  headerWrapper.appendChild(headerCell)

  headerInner.prepend(headerWrapper)
}

  dataRows.forEach((row, index) => {
    if (
      row.querySelector('[data-comic-read-cell]')
    ) {
      return
    }

    const comicId = getComicIdFromRow(row, index)

    const cell = document.createElement('div')

    cell.className =
      'notion-table-cell comic-read-table-cell'

    cell.dataset.comicReadCell = 'true'
    cell.dataset.comicId = comicId

    const checkbox = document.createElement('input')

    checkbox.type = 'checkbox'
    checkbox.className = 'comic-read-checkbox'
    checkbox.checked = savedState[comicId] === true

    checkbox.setAttribute(
      'aria-label',
      '标记这部漫画为已读'
    )

    checkbox.addEventListener('click', event => {
      /*
       * 防止点击 checkbox 时触发表格行跳转。
       */
      event.stopPropagation()
    })

    checkbox.addEventListener('change', event => {
      saveState(
        comicId,
        event.currentTarget.checked
      )
    })

    cell.appendChild(checkbox)
    row.prepend(cell)
  })

  console.log(
    '[ComicReadTableEnhancer] 已处理漫画行：',
    dataRows.length
  )

  return true
}

const ComicReadTableEnhancer = ({
  enabled = false
}) => {
  useEffect(() => {
    if (!enabled) {
      return
    }

    const root = document.getElementById(
      'notion-article'
    )

    if (!root) {
      console.log(
        '[ComicReadTableEnhancer] 没找到 #notion-article'
      )

      return
    }

    let timer = null

    const run = () => {
      window.clearTimeout(timer)

      timer = window.setTimeout(() => {
        enhanceTable(root)
      }, 100)
    }

    /*
     * 首次给 NotionRenderer 一点渲染时间。
     */
    timer = window.setTimeout(() => {
      enhanceTable(root)
    }, 800)

    /*
     * 数据库异步加载或重新渲染后继续检查。
     */
    const observer = new MutationObserver(run)

    observer.observe(root, {
      childList: true,
      subtree: true
    })

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
      removeEnhancement(root)
    }
  }, [enabled])

  if (!enabled) {
    return null
  }

  return (
    <style jsx global>{`
      .comic-read-table-th,
      .comic-read-table-header-cell,
      .comic-read-table-cell {
        width: 58px !important;
        min-width: 58px !important;
        max-width: 58px !important;

        flex: 0 0 58px !important;

        box-sizing: border-box;
      }

      .comic-read-table-header-cell,
      .comic-read-table-cell {
        display: flex !important;
        align-items: center;
        justify-content: center;
      }

      .comic-read-table-header-cell
        .notion-table-view-header-cell-inner {
        display: flex;
        align-items: center;
        justify-content: center;

        width: 100%;
      }


      .comic-read-checkbox {
        width: 16px;
        height: 16px;

        margin: 0;

        /*
         * 控制原生复选框勾选后的颜色。
         */
        accent-color: #727272;

        cursor: pointer;
      }
    `}</style>
  )
}

export default ComicReadTableEnhancer