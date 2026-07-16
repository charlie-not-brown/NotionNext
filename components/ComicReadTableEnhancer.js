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
    label: '想读',
    group: '待办'
  },
  reading: {
    label: '在读',
    group: '进行中'
  },
  finished: {
    label: '读完',
    group: '已完成'
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
 * 读取浏览器里保存的阅读状态。
 */
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
     * 自动迁移旧版复选框数据：
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

/**
 * 保存一本漫画的阅读状态。
 *
 * 空字符串代表清除状态。
 */
const saveState = (comicId, status) => {
  if (!comicId) {
    return false
  }

  try {
    const state = getSavedState()

    if (VALID_STATUSES.includes(status)) {
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
      '[ComicReadTableEnhancer] 保存状态失败',
      error
    )

    return false
  }
}

/**
 * 从表格行的链接中提取漫画条目的 Notion pageId。
 */
const getComicIdFromRow = (row, index) => {
  const link = row.querySelector('a[href]')

  if (link) {
    const href =
      link.getAttribute('href') || ''

    const path = href
      .split('?')[0]
      .split('#')[0]
      .replace(/^\/+/, '')

    const possibleId =
      path.split('/').pop()

    if (
      possibleId &&
      /^[a-f0-9]{32}$/i.test(possibleId)
    ) {
      return possibleId.toLowerCase()
    }
  }

  /*
   * 如果数据库链接被移除了 href，
   * 则使用标题作为稳定的备用标识。
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
 * 删除组件插入的状态列。
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
 * 在表格单元格中绘制当前状态。
 *
 * 没有状态时，按钮保持空白。
 */
const renderStatusTrigger = (
  trigger,
  status
) => {
  trigger.replaceChildren()

  trigger.dataset.status = status || ''

  trigger.classList.toggle(
    'is-empty',
    !status
  )

  const statusMeta = STATUS_META[status]

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

  trigger.title = statusMeta.label

  const pill =
    document.createElement('span')

  pill.className =
    `comic-status-pill is-${status}`

  const dot =
    document.createElement('span')

  dot.className = 'comic-status-dot'

  const label =
    document.createElement('span')

  label.textContent = statusMeta.label

  pill.appendChild(dot)
  pill.appendChild(label)

  trigger.appendChild(pill)
}

/**
 * 创建 Notion 风格状态选择器。
 */
const createStatusPicker = ({
  comicId,
  currentStatus,
  onChange
}) => {
  let status = currentStatus || ''
  let menuOpen = false

  const trigger =
    document.createElement('button')

  trigger.type = 'button'
  trigger.className =
    'comic-status-trigger'

  renderStatusTrigger(trigger, status)

  const openMenu = () => {
    /*
     * 先关闭页面中其他已经打开的状态菜单。
     */
    closeActiveStatusMenu?.()

    menuOpen = true

    const menu =
      document.createElement('div')

    menu.className = 'comic-status-menu'

    const search =
      document.createElement('input')

    search.type = 'text'
    search.className =
      'comic-status-search'

    search.placeholder = '搜索选项'

    search.setAttribute(
      'aria-label',
      '搜索阅读状态'
    )

    const optionsContainer =
      document.createElement('div')

    optionsContainer.className =
      'comic-status-options'

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
        closeActiveStatusMenu === closeMenu
      ) {
        closeActiveStatusMenu = null
      }
    }

    const handleOutsideClick = event => {
      if (
        menu.contains(event.target) ||
        trigger.contains(event.target)
      ) {
        return
      }

      closeMenu()
    }

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        closeMenu()
        trigger.focus()
      }
    }

    const positionMenu = () => {
      const rect =
        trigger.getBoundingClientRect()

      const menuWidth = 220
      const pagePadding = 12

      let left = rect.left
      let top = rect.bottom + 6

      if (
        left + menuWidth >
        window.innerWidth - pagePadding
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

      menu.style.top = `${top}px`

      const menuRect =
        menu.getBoundingClientRect()

      if (
        menuRect.bottom >
        window.innerHeight - pagePadding
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

    const applyStatus = async nextStatus => {
      const previousStatus = status

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

        if (succeeded === false) {
          status = previousStatus

          renderStatusTrigger(
            trigger,
            status
          )
        }
      } catch (error) {
        console.error(
          '[ComicReadTableEnhancer] 状态修改失败',
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

    const renderOptions = (
      keyword = ''
    ) => {
      optionsContainer.replaceChildren()

      const normalizedKeyword =
        keyword.trim().toLowerCase()

      for (
        const statusValue
        of STATUS_ORDER
      ) {
        const meta =
          STATUS_META[statusValue]

        if (
          normalizedKeyword &&
          !meta.label
            .toLowerCase()
            .includes(normalizedKeyword)
        ) {
          continue
        }

        const group =
          document.createElement('div')

        group.className =
          'comic-status-group'

        const groupTitle =
          document.createElement('div')

        groupTitle.className =
          'comic-status-group-title'

        groupTitle.textContent =
          meta.group

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

        group.appendChild(groupTitle)
        group.appendChild(option)

        optionsContainer.appendChild(
          group
        )
      }

      /*
       * 已经选中状态时，
       * 在菜单底部提供清除功能。
       */
      if (
        status &&
        !normalizedKeyword
      ) {
        const clearButton =
          document.createElement('button')

        clearButton.type = 'button'

        clearButton.className =
          'comic-status-clear'

        clearButton.textContent =
          '清除状态'

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
    }

    search.addEventListener(
      'input',
      event => {
        renderOptions(
          event.currentTarget.value
        )
      }
    )

    menu.addEventListener(
      'click',
      event => {
        event.stopPropagation()
      }
    )

    menu.appendChild(search)
    menu.appendChild(optionsContainer)

    document.body.appendChild(menu)

    renderOptions()
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

    closeActiveStatusMenu = closeMenu

    window.requestAnimationFrame(() => {
      search.focus()
    })
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

  trigger.dataset.comicId = comicId

  return trigger
}

/**
 * 给页面中的第一个 Notion Table 增加状态列。
 */
const enhanceTable = root => {
  const table =
    root.querySelector('.notion-table')

  if (!table) {
    console.log(
      '[ComicReadTableEnhancer] 没找到 .notion-table'
    )

    return false
  }

  const headerInner =
    table.querySelector(
      '.notion-table-header-inner'
    )

  const dataRows = Array.from(
    table.querySelectorAll(
      '.notion-table-body > .notion-table-row'
    )
  )

  if (
    !headerInner ||
    dataRows.length === 0
  ) {
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
   * 增加状态表头。
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

    headerWrapper.dataset.comicReadHeader =
      'true'

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

    headerCell.appendChild(
      headerCellInner
    )

    headerWrapper.appendChild(headerCell)
    headerInner.prepend(headerWrapper)
  }

  /*
   * 给每一条漫画增加状态单元格。
   */
  dataRows.forEach((row, index) => {
    if (
      row.querySelector(
        '[data-comic-read-cell]'
      )
    ) {
      return
    }

    const comicId =
      getComicIdFromRow(row, index)

    const cell =
      document.createElement('div')

    cell.className =
      'notion-table-cell comic-read-table-cell'

    cell.dataset.comicReadCell = 'true'
    cell.dataset.comicId = comicId

    const statusPicker =
      createStatusPicker({
        comicId,

        currentStatus:
          savedState[comicId] || '',

        onChange: async nextStatus => {
          return saveState(
            comicId,
            nextStatus
          )
        }
      })

    cell.appendChild(statusPicker)
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

    const root =
      document.getElementById(
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
     * 等待 NotionRenderer 首次完成渲染。
     */
    timer = window.setTimeout(() => {
      enhanceTable(root)
    }, 800)

    /*
     * 数据库后续异步渲染或重新加载时，
     * 自动为新增的行补上状态控件。
     */
    const observer =
      new MutationObserver(run)

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
      /*
       * ==========================================
       * 状态列宽度
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
       * 表格里的状态按钮
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
      }

      /*
       * 未设置状态时，
       * 单元格中不显示任何文字。
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

        padding: 1px 8px;

        border-radius: 999px;

        font-size: 14px;
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
       * 弹出的状态菜单
       * ==========================================
       */

      .comic-status-menu {
        position: fixed;
        z-index: 99999;

        width: 220px;
        max-height: min(420px, 80vh);

        padding: 6px;

        overflow-y: auto;

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

      .comic-status-search {
        width: 100%;
        height: 32px;

        padding: 0 9px;
        margin-bottom: 5px;

        color: #37352f;
        background: #ffffff;

        border: 1px solid
          rgba(15, 15, 15, 0.12);

        border-radius: 4px;

        box-sizing: border-box;

        font-size: 14px;

        outline: none;
      }

      .comic-status-search::placeholder {
        color:
          rgba(55, 53, 47, 0.42);
      }

      .comic-status-search:focus {
        border-color:
          rgba(55, 53, 47, 0.35);

        box-shadow:
          0 0 0 1px
          rgba(55, 53, 47, 0.08);
      }

      .comic-status-group {
        padding: 3px 0;
      }

      .comic-status-group-title {
        padding: 5px 8px 3px;

        color:
          rgba(55, 53, 47, 0.58);

        font-size: 12px;
        line-height: 18px;
      }

      .comic-status-option,
      .comic-status-clear {
        display: flex;
        align-items: center;

        width: 100%;
        min-height: 32px;

        padding: 4px 8px;

        color: #37352f;
        background: transparent;

        border: 0;
        border-radius: 4px;

        box-sizing: border-box;

        font: inherit;
        text-align: left;

        cursor: pointer;
      }

      .comic-status-option:hover,
      .comic-status-option.is-current,
      .comic-status-clear:hover {
        background:
          rgba(55, 53, 47, 0.08);
      }

      .comic-status-clear {
        margin-top: 5px;

        color:
          rgba(55, 53, 47, 0.68);

        border-top: 1px solid
          rgba(55, 53, 47, 0.09);

        border-radius: 0 0 4px 4px;
      }

      /*
       * 暗色模式下让菜单保持可读。
       */
      .dark .comic-status-menu {
        color: #e8e8e8;
        background: #252525;

        border-color:
          rgba(255, 255, 255, 0.1);
      }

      .dark .comic-status-search {
        color: #eeeeee;
        background: #303030;

        border-color:
          rgba(255, 255, 255, 0.14);
      }

      .dark
        .comic-status-group-title,
      .dark
        .comic-status-clear {
        color:
          rgba(235, 235, 235, 0.66);
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