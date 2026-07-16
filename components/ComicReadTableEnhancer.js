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

const STATUS_META = {
  want: {
    label: '想读'
  },
  reading: {
    label: '在读'
  },
  finished: {
    label: '读完'
  }
}

const STATUS_ORDER = [
  'want',
  'reading',
  'finished'
]

/*
 * 页面同一时间只允许打开一个状态菜单。
 */
let closeActiveStatusMenu = null

/**
 * 读取当前浏览器保存的阅读状态。
 */
const getSavedState = () => {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const currentData =
      window.localStorage.getItem(
        STORAGE_KEY
      )

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
        migratedState[comicId] =
          'finished'
      }
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(migratedState)
    )

    return migratedState
  } catch (error) {
    console.warn(
      '[ComicReadTableEnhancer] ' +
        '读取状态失败',
      error
    )

    return {}
  }
}

/**
 * 保存某一本漫画的阅读状态。
 *
 * status 为空字符串时，
 * 删除该漫画的阅读状态。
 */
const saveState = (
  comicId,
  status
) => {
  if (!comicId) {
    return false
  }

  try {
    const state = getSavedState()

    if (
      VALID_STATUSES.includes(status)
    ) {
      state[comicId] = status
    } else {
      delete state[comicId]
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    )

    return true
  } catch (error) {
    console.warn(
      '[ComicReadTableEnhancer] ' +
        '保存状态失败',
      error
    )

    return false
  }
}

/**
 * 将可能带横杠的 Notion pageId
 * 统一转换成 32 位小写 ID。
 */
const normalizeComicId = value => {
  if (!value) {
    return null
  }

  const compact = String(value)
    .replace(/-/g, '')
    .toLowerCase()

  return /^[a-f0-9]{32}$/.test(compact)
    ? compact
    : null
}

/**
 * 自动读取当前漫画行的 Notion pageId。
 *
 * 不需要手工收集任何漫画 ID。
 */
const getComicIdFromRow = (
  row,
  index
) => {
  /*
   * 优先尝试从行的 className 中读取。
   */
  for (
    const className
    of row.classList
  ) {
    const comicId =
      normalizeComicId(className)

    if (comicId) {
      return comicId
    }
  }

  /*
   * 再尝试从 data 属性中读取。
   */
  const possibleDatasetIds = [
    row.dataset.blockId,
    row.dataset.id,
    row.getAttribute(
      'data-block-id'
    )
  ]

  for (
    const possibleId
    of possibleDatasetIds
  ) {
    const comicId =
      normalizeComicId(possibleId)

    if (comicId) {
      return comicId
    }
  }

  /*
   * 再尝试从行内链接读取 pageId。
   */
  const links =
    row.querySelectorAll('a[href]')

  for (const link of links) {
    const href =
      link.getAttribute('href') || ''

    const match = href.match(
      /([a-f0-9-]{32,36})(?:[/?#]|$)/i
    )

    if (match?.[1]) {
      const comicId =
        normalizeComicId(match[1])

      if (comicId) {
        return comicId
      }
    }
  }

  /*
   * 最后使用漫画标题作为备用 ID。
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

/**
 * 删除组件插入的状态列和菜单。
 */
const removeEnhancement = root => {
  closeActiveStatusMenu?.()
  closeActiveStatusMenu = null

  root
    ?.querySelectorAll(
      [
        '[data-comic-read-header]',
        '[data-comic-read-cell]'
      ].join(',')
    )
    .forEach(element => {
      element.remove()
    })
}

/**
 * 绘制状态单元格。
 *
 * 没有状态时保持空白；
 * 选择状态后显示彩色胶囊。
 */
const renderStatusTrigger = (
  trigger,
  status
) => {
  trigger.replaceChildren()

  trigger.dataset.status =
    status || ''

  trigger.classList.toggle(
    'is-empty',
    !status
  )

  const statusMeta =
    STATUS_META[status]

  if (!statusMeta) {
    trigger.setAttribute(
      'aria-label',
      '设置阅读状态'
    )

    trigger.title = '设置阅读状态'

    return
  }

  trigger.setAttribute(
    'aria-label',
    `当前状态：${statusMeta.label}`
  )

  trigger.title =
    statusMeta.label

  const pill =
    document.createElement('span')

  pill.className =
    `comic-status-pill is-${status}`

  const dot =
    document.createElement('span')

  dot.className =
    'comic-status-dot'

  const label =
    document.createElement('span')

  label.textContent =
    statusMeta.label

  pill.appendChild(dot)
  pill.appendChild(label)

  trigger.appendChild(pill)
}

/**
 * 创建状态胶囊和弹出菜单。
 */
const createStatusPicker = ({
  comicId,
  currentStatus,
  onChange
}) => {
  let status =
    currentStatus || ''

  let menuOpen = false

  const trigger =
    document.createElement('button')

  trigger.type = 'button'

  trigger.className =
    'comic-status-trigger'

  trigger.dataset.comicId =
    comicId

  renderStatusTrigger(
    trigger,
    status
  )

  const openMenu = () => {
    /*
     * 关闭其他行已经打开的菜单。
     */
    closeActiveStatusMenu?.()

    menuOpen = true

    const menu =
      document.createElement('div')

    menu.className =
      'comic-status-menu'

    const optionsContainer =
      document.createElement('div')

    optionsContainer.className =
      'comic-status-options'

    const handleOutsideClick =
      event => {
        if (
          menu.contains(event.target) ||
          trigger.contains(event.target)
        ) {
          return
        }

        closeMenu()
      }

    const handleKeyDown =
      event => {
        if (event.key === 'Escape') {
          closeMenu()
          trigger.focus()
        }
      }

    const closeMenu = () => {
      if (!menuOpen) {
        return
      }

      menuOpen = false

      menu.remove()

      document.removeEventListener(
        'pointerdown',
        handleOutsideClick,
        true
      )

      document.removeEventListener(
        'keydown',
        handleKeyDown
      )

      window.removeEventListener(
        'resize',
        closeMenu
      )

      window.removeEventListener(
        'scroll',
        closeMenu,
        true
      )

      if (
        closeActiveStatusMenu ===
        closeMenu
      ) {
        closeActiveStatusMenu = null
      }
    }

    const positionMenu = () => {
      const rect =
        trigger.getBoundingClientRect()

      const menuWidth = 136
      const pagePadding = 12

      let left = rect.left
      let top = rect.bottom + 6

      if (
        left + menuWidth >
        window.innerWidth -
          pagePadding
      ) {
        left =
          window.innerWidth -
          menuWidth -
          pagePadding
      }

      menu.style.left =
        `${Math.max(
          pagePadding,
          left
        )}px`

      menu.style.top =
        `${top}px`

      const menuRect =
        menu.getBoundingClientRect()

      if (
        menuRect.bottom >
        window.innerHeight -
          pagePadding
      ) {
        top =
          rect.top -
          menuRect.height -
          6

        menu.style.top =
          `${Math.max(
            pagePadding,
            top
          )}px`
      }
    }

    const applyStatus =
      async nextStatus => {
        const previousStatus = status

        /*
         * 先立即更新界面，
         * 让点击反馈更加自然。
         */
        status = nextStatus

        renderStatusTrigger(
          trigger,
          status
        )

        closeMenu()

        trigger.disabled = true

        try {
          const succeeded =
            await onChange(nextStatus)

          /*
           * 保存失败时恢复原状态。
           */
          if (succeeded === false) {
            status = previousStatus

            renderStatusTrigger(
              trigger,
              status
            )
          }
        } catch (error) {
          console.error(
            '[ComicReadTableEnhancer] ' +
              '状态修改失败',
            error
          )

          status = previousStatus

          renderStatusTrigger(
            trigger,
            status
          )
        } finally {
          trigger.disabled = false
        }
      }

    /*
     * 创建三个状态选项。
     */
    for (
      const statusValue
      of STATUS_ORDER
    ) {
      const meta =
        STATUS_META[statusValue]

      const option =
        document.createElement('button')

      option.type = 'button'

      option.className =
        [
          'comic-status-option',
          status === statusValue
            ? 'is-current'
            : ''
        ]
          .filter(Boolean)
          .join(' ')

      const pill =
        document.createElement('span')

      pill.className =
        `comic-status-pill is-${statusValue}`

      const dot =
        document.createElement('span')

      dot.className =
        'comic-status-dot'

      const label =
        document.createElement('span')

      label.textContent = meta.label

      pill.appendChild(dot)
      pill.appendChild(label)

      option.appendChild(pill)

      option.addEventListener(
        'click',
        event => {
          event.preventDefault()
          event.stopPropagation()

          applyStatus(statusValue)
        }
      )

      optionsContainer.appendChild(
        option
      )
    }

    /*
     * 当前已经有状态时，
     * 菜单底部显示“清除”。
     */
    if (status) {
      const clearButton =
        document.createElement('button')

      clearButton.type = 'button'

      clearButton.className =
        'comic-status-clear'

      clearButton.textContent = '清除'

      clearButton.addEventListener(
        'click',
        event => {
          event.preventDefault()
          event.stopPropagation()

          applyStatus('')
        }
      )

      optionsContainer.appendChild(
        clearButton
      )
    }

    menu.addEventListener(
      'click',
      event => {
        event.stopPropagation()
      }
    )

    menu.appendChild(
      optionsContainer
    )

    document.body.appendChild(menu)

    positionMenu()

    document.addEventListener(
      'pointerdown',
      handleOutsideClick,
      true
    )

    document.addEventListener(
      'keydown',
      handleKeyDown
    )

    window.addEventListener(
      'resize',
      closeMenu
    )

    window.addEventListener(
      'scroll',
      closeMenu,
      true
    )

    closeActiveStatusMenu =
      closeMenu
  }

  trigger.addEventListener(
    'click',
    event => {
      event.preventDefault()
      event.stopPropagation()

      if (menuOpen) {
        closeActiveStatusMenu?.()
        return
      }

      openMenu()
    }
  )

  return trigger
}

/**
 * 给页面中的第一个 Notion Table
 * 添加“状态”列。
 */
const enhanceTable = root => {
  const table =
    root.querySelector(
      '.notion-table'
    )

  if (!table) {
    return false
  }

  const headerInner =
    table.querySelector(
      '.notion-table-header-inner'
    )

  const dataRows = Array.from(
    table.querySelectorAll(
      '.notion-table-body > ' +
        '.notion-table-row'
    )
  )

  if (
    !headerInner ||
    dataRows.length === 0
  ) {
    return false
  }

  const savedState =
    getSavedState()

  /*
   * 添加真正的表头单元格。
   */
  if (
    !headerInner.querySelector(
      '[data-comic-read-header]'
    )
  ) {
    const headerWrapper =
      document.createElement('div')

    headerWrapper.className =
      'notion-table-th ' +
      'comic-read-table-th'

    headerWrapper.dataset
      .comicReadHeader = 'true'

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

    headerCellInner.textContent =
      '状态'

    headerCell.appendChild(
      headerCellInner
    )

    headerWrapper.appendChild(
      headerCell
    )

    headerInner.prepend(
      headerWrapper
    )
  }

  /*
   * 为每条漫画增加状态单元格。
   */
  dataRows.forEach(
    (row, index) => {
      if (
        row.querySelector(
          '[data-comic-read-cell]'
        )
      ) {
        return
      }

      const comicId =
        getComicIdFromRow(
          row,
          index
        )

      const cell =
        document.createElement('div')

      cell.className =
        'notion-table-cell ' +
        'comic-read-table-cell'

      cell.dataset.comicReadCell =
        'true'

      cell.dataset.comicId =
        comicId

      const statusPicker =
        createStatusPicker({
          comicId,

          currentStatus:
            savedState[comicId] || '',

          onChange:
            async nextStatus => {
              return saveState(
                comicId,
                nextStatus
              )
            }
        })

      cell.appendChild(
        statusPicker
      )

      row.prepend(cell)
    }
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

    const root =
      document.getElementById(
        'notion-article'
      )

    if (!root) {
      console.log(
        '[ComicReadTableEnhancer] ' +
          '没找到 #notion-article'
      )

      return
    }

    /*
     * 不再使用 MutationObserver。
     *
     * 只在页面初次加载期间检查四次，
     * 避免手机端持续扫描整篇文章，
     * 导致卡顿和发热。
     *
     * 最后一次安排在 5 秒，
     * 兼容移动网络下数据库加载较慢。
     */
    const delays = [
      400,
      1200,
      2500,
      5000
    ]

    const timers =
      delays.map(delay =>
        window.setTimeout(() => {
          enhanceTable(root)
        }, delay)
      )

    return () => {
      timers.forEach(timer => {
        window.clearTimeout(timer)
      })

      removeEnhancement(root)
    }
  }, [enabled])

  if (!enabled) {
    return null
  }

  return (
    <style jsx global>{`
      /*
       * ==========================================
       * 状态列
       * ==========================================
       */

      .comic-read-table-th,
      .comic-read-table-header-cell,
      .comic-read-table-cell {
        width: 78px !important;
        min-width: 78px !important;
        max-width: 78px !important;

        flex: 0 0 78px !important;

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

      /*
       * ==========================================
       * 表格中的状态按钮
       * ==========================================
       */

      .comic-status-trigger {
        display: flex;
        align-items: center;
        justify-content: center;

        width: 100%;
        min-height: 32px;

        padding: 0 3px;

        color: inherit;
        background: transparent;

        border: 0;
        border-radius: 4px;

        cursor: pointer;
        outline: none;

        touch-action: manipulation;

        -webkit-tap-highlight-color:
          transparent;
      }

      /*
       * 未设置状态时保持空白。
       */
      .comic-status-trigger.is-empty {
        color: transparent;
      }

      .comic-status-trigger:hover {
        background:
          rgba(80, 80, 80, 0.06);
      }

      .comic-status-trigger:focus-visible {
        box-shadow:
          inset 0 0 0 1px
          rgba(50, 50, 50, 0.32);
      }

      .comic-status-trigger:disabled {
        cursor: wait;
        opacity: 0.6;
      }

      /*
       * ==========================================
       * 状态胶囊
       * ==========================================
       */

      .comic-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;

        min-height: 23px;

        padding: 1px 7px;

        border-radius: 999px;

        font-size: 13px;
        line-height: 21px;

        white-space: nowrap;
      }

      .comic-status-dot {
        display: block;

        width: 8px;
        height: 8px;

        flex: 0 0 8px;

        border-radius: 50%;
      }

      /*
       * 想读：灰色
       */
      .comic-status-pill.is-want {
        color: #5f5f5f;
        background: #e8e8e7;
      }

      .comic-status-pill.is-want
        .comic-status-dot {
        background: #9b9b99;
      }

      /*
       * 在读：蓝色
       */
      .comic-status-pill.is-reading {
        color: #1769a8;
        background: #dceeff;
      }

      .comic-status-pill.is-reading
        .comic-status-dot {
        background: #2f80cf;
      }

      /*
       * 读完：绿色
       */
      .comic-status-pill.is-finished {
        color: #27714c;
        background: #dff1e7;
      }

      .comic-status-pill.is-finished
        .comic-status-dot {
        background: #4ba574;
      }

      /*
       * ==========================================
       * 弹出状态菜单
       * ==========================================
       */

      .comic-status-menu {
        position: fixed;
        z-index: 99999;

        width: 136px;

        padding: 6px;

        color: #37352f;
        background: #ffffff;

        border: 1px solid
          rgba(15, 15, 15, 0.08);

        border-radius: 7px;

        box-sizing: border-box;

        box-shadow:
          0 4px 18px
            rgba(15, 15, 15, 0.14),
          0 1px 3px
            rgba(15, 15, 15, 0.1);
      }

      .comic-status-options {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .comic-status-option,
      .comic-status-clear {
        display: flex;
        align-items: center;

        width: 100%;
        min-height: 32px;

        padding: 4px 7px;

        color: #37352f;
        background: transparent;

        border: 0;
        border-radius: 4px;

        box-sizing: border-box;

        font: inherit;
        font-size: 13px;
        text-align: left;

        cursor: pointer;

        touch-action: manipulation;

        -webkit-tap-highlight-color:
          transparent;
      }

      .comic-status-option:hover,
      .comic-status-option.is-current,
      .comic-status-clear:hover {
        background:
          rgba(55, 53, 47, 0.08);
      }

      .comic-status-clear {
        justify-content: center;

        min-height: 29px;
        margin-top: 4px;
        padding-top: 5px;

        color:
          rgba(55, 53, 47, 0.64);

        border-top: 1px solid
          rgba(55, 53, 47, 0.09);

        border-radius: 0 0 4px 4px;
      }

      /*
       * ==========================================
       * 暗色模式
       * ==========================================
       */

      .dark .comic-status-menu {
        color: #e8e8e8;
        background: #252525;

        border-color:
          rgba(255, 255, 255, 0.1);
      }

      .dark .comic-status-option,
      .dark .comic-status-clear {
        color: #e8e8e8;
      }

      .dark .comic-status-clear {
        color:
          rgba(235, 235, 235, 0.66);

        border-top-color:
          rgba(255, 255, 255, 0.1);
      }

      .dark
        .comic-status-option:hover,
      .dark
        .comic-status-option.is-current,
      .dark
        .comic-status-clear:hover {
        background:
          rgba(255, 255, 255, 0.08);
      }
    `}</style>
  )
}

export default ComicReadTableEnhancer