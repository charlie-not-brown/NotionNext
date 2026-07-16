import { useEffect } from 'react'

const STORAGE_KEY =
  'notionnext-comic-reading-status-v2'

const OLD_STORAGE_KEY =
  'notionnext-comic-read-status-v1'

const VALID_STATUSES = [
  'want',
  'reading',
  'finished'
]

const getSavedState = () => {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const currentData =
      window.localStorage.getItem(STORAGE_KEY)

    if (currentData) {
      const parsed = JSON.parse(currentData)

      return parsed &&
        typeof parsed === 'object'
        ? parsed
        : {}
    }

    /*
     * 自动迁移此前 checkbox 的测试数据：
     *
     * true → finished（读完）
     */
    const oldData =
      window.localStorage.getItem(
        OLD_STORAGE_KEY
      )

    if (!oldData) {
      return {}
    }

    const oldState = JSON.parse(oldData)
    const migratedState = {}

    for (
      const [comicId, checked]
      of Object.entries(oldState)
    ) {
      if (checked === true) {
        migratedState[comicId] = 'finished'
      }
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(migratedState)
    )

    return migratedState
  } catch (error) {
    console.warn(
      '[ComicReadTableEnhancer] 读取状态失败',
      error
    )

    return {}
  }
}

const saveState = (comicId, status) => {
  if (!comicId) {
    return
  }

  try {
    const state = getSavedState()

    if (VALID_STATUSES.includes(status)) {
      state[comicId] = status
    } else {
      /*
       * 选择“未设置”时删除该记录。
       */
      delete state[comicId]
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    )
  } catch (error) {
    console.warn(
      '[ComicReadTableEnhancer] 保存状态失败',
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

  headerCellInner.textContent = '状态'

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

    const select = document.createElement('select')

    select.className = 'comic-reading-status-select'

    select.setAttribute(
      'aria-label',
      '设置这部漫画的阅读状态'
    )

    const options = [
      {
        value: '',
        label: '未设置'
      },
      {
        value: 'want',
        label: '想读'
      },
      {
        value: 'reading',
       label: '在读'
      },
      {
        value: 'finished',
        label: '读完'
      }
    ]

    for (const optionData of options) {
      const option =
        document.createElement('option')

      option.value = optionData.value
      option.textContent = optionData.label

      select.appendChild(option)
    }

    select.value = savedState[comicId] || ''

    select.dataset.status = select.value

    select.addEventListener('click', event => {
      /*
       * 防止点击下拉框时触发表格行跳转。
       */
     event.stopPropagation()
    })

    select.addEventListener('change', event => {
      const status = event.currentTarget.value

      event.currentTarget.dataset.status =
        status

      saveState(comicId, status)
    })

    cell.appendChild(select)
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


      .comic-reading-status-select {
        width: 78px;
        height: 28px;

        padding: 0 7px;

        color: #333333;
        background: #fafafa;

        border: 1px solid
          rgba(40, 40, 40, 0.3);
        border-radius: 4px;

        font-size: 13px;
        line-height: 1;

        cursor: pointer;
        outline: none;
      }

      .comic-reading-status-select:hover {
        border-color:
          rgba(30, 30, 30, 0.65);
      }

      .comic-reading-status-select:focus {
        border-color: #333333;

        box-shadow:
          0 0 0 1px
          rgba(51, 51, 51, 0.16);
      }

      .comic-reading-status-select[
        data-status='finished'
      ] {
        color: #ffffff;
        background: ;
        border-color: #333333;
      }

      .comic-reading-status-select[
        data-status='reading'
      ] {
        color: #222222;
        background: #e5e5e5;
        border-color: #888888;
      }

      .comic-reading-status-select[
        data-status='want'
      ] {
        color: #333333;
        background: #fafafa;
      }
    `}</style>
  )
}

export default ComicReadTableEnhancer