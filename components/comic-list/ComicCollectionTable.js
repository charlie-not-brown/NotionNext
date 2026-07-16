import { useEffect } from 'react'
import { getBlockCollectionId } from 'notion-utils'
import styles from './ComicCollectionTable.module.css'

const STORAGE_KEY =
  'notionnext-comic-reading-status-v2'

const OLD_STORAGE_KEY =
  'notionnext-comic-read-status-v1'

const STATUS_META = {
  want: {
    label: '想读',
    className: styles.want
  },
  reading: {
    label: '在读',
    className: styles.reading
  },
  finished: {
    label: '读完',
    className: styles.finished
  }
}

const STATUS_ORDER = [
  'want',
  'reading',
  'finished'
]

let closeActiveStatusMenu = null

const normalizeNotionId = id => {
  return String(id || '')
    .replace(/-/g, '')
    .toLowerCase()
}

const readSavedState = () => {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const currentValue =
      window.localStorage.getItem(
        STORAGE_KEY
      )

    if (currentValue) {
      const parsed =
        JSON.parse(currentValue)

      return parsed &&
        typeof parsed === 'object'
        ? parsed
        : {}
    }

    const oldValue =
      window.localStorage.getItem(
        OLD_STORAGE_KEY
      )

    if (!oldValue) {
      return {}
    }

    const oldState =
      JSON.parse(oldValue)

    const migratedState = {}

    Object.entries(oldState).forEach(
      ([comicId, checked]) => {
        if (checked === true) {
          migratedState[comicId] =
            'finished'
        }
      }
    )

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(migratedState)
    )

    return migratedState
  } catch (error) {
    console.warn(
      '[ComicCollectionTable] 读取状态失败',
      error
    )

    return {}
  }
}

const saveStatus = (
  comicId,
  status
) => {
  try {
    const state = readSavedState()

    if (STATUS_META[status]) {
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
      '[ComicCollectionTable] 保存状态失败',
      error
    )

    return false
  }
}

const clearElement = element => {
  while (element.firstChild) {
    element.removeChild(
      element.firstChild
    )
  }
}

const createPill = status => {
  const meta = STATUS_META[status]

  if (!meta) {
    return null
  }

  const pill =
    document.createElement('span')

  pill.className = [
    styles.pill,
    meta.className
  ].join(' ')

  const dot =
    document.createElement('span')

  dot.className = styles.dot

  const label =
    document.createElement('span')

  label.className = styles.label
  label.textContent = meta.label

  pill.appendChild(dot)
  pill.appendChild(label)

  return pill
}

const renderTrigger = (
  trigger,
  status
) => {
  clearElement(trigger)

  trigger.dataset.status =
    status || ''

  trigger.classList.toggle(
    styles.empty,
    !status
  )

  const meta = STATUS_META[status]

  if (!meta) {
    trigger.setAttribute(
      'aria-label',
      '设置阅读状态'
    )

    trigger.title = '设置阅读状态'

    return
  }

  trigger.setAttribute(
    'aria-label',
    `当前状态：${meta.label}`
  )

  trigger.title = meta.label

  const pill = createPill(status)

  if (pill) {
    trigger.appendChild(pill)
  }
}

const openStatusMenu = (
  trigger,
  comicId
) => {
  closeActiveStatusMenu?.()

  const menu =
    document.createElement('div')

  menu.className = styles.menu

  let isOpen = true

  const closeMenu = () => {
    if (!isOpen) {
      return
    }

    isOpen = false

    menu.remove()

    trigger.setAttribute(
      'aria-expanded',
      'false'
    )

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

  const applyStatus = nextStatus => {
    if (
      !saveStatus(
        comicId,
        nextStatus
      )
    ) {
      return
    }

    renderTrigger(
      trigger,
      nextStatus
    )

    closeMenu()
  }

  STATUS_ORDER.forEach(status => {
    const option =
      document.createElement('button')

    option.type = 'button'

    option.className =
      styles.option

    if (
      trigger.dataset.status === status
    ) {
      option.classList.add(
        styles.current
      )
    }

    const pill = createPill(status)

    if (pill) {
      option.appendChild(pill)
    }

    option.addEventListener(
      'click',
      event => {
        event.preventDefault()
        event.stopPropagation()

        applyStatus(status)
      }
    )

    menu.appendChild(option)
  })

  if (trigger.dataset.status) {
    const clearButton =
      document.createElement('button')

    clearButton.type = 'button'
    clearButton.className =
      styles.clearButton
    clearButton.textContent = '清除'

    clearButton.addEventListener(
      'click',
      event => {
        event.preventDefault()
        event.stopPropagation()

        applyStatus('')
      }
    )

    menu.appendChild(clearButton)
  }

  document.body.appendChild(menu)

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

  positionMenu()

  trigger.setAttribute(
    'aria-expanded',
    'true'
  )

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

const getFallbackComicId = (
  row,
  index
) => {
  const links =
    row.querySelectorAll('a[href]')

  for (const link of links) {
    const href =
      link.getAttribute('href') || ''

    const match = href.match(
      /([a-f0-9-]{32,36})(?:[/?#]|$)/i
    )

    const comicId =
      normalizeNotionId(match?.[1])

    if (
      /^[a-f0-9]{32}$/.test(
        comicId
      )
    ) {
      return comicId
    }
  }

  const title =
    row.textContent?.trim() ||
    `row-${index}`

  return `title-${title}`
}

const ComicCollectionTable = ({
  OriginalCollection,
  databaseId,
  block,
  ctx,
  ...collectionProps
}) => {
  const collectionClassName =
    `comic-collection-${normalizeNotionId(
      databaseId
    )}`

  const mergedClassName = [
    collectionProps.className,
    collectionClassName
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    if (
      !block ||
      !ctx?.recordMap
    ) {
      return
    }

    let disposed = false
    let locateTimer = null
    let batchFrame = null
    let bodyObserver = null
    let root = null
    let body = null
    let queue = []
    let queueRunning = false
    let locateAttempts = 0

    const recordMap = ctx.recordMap

    const collectionId =
      getBlockCollectionId(
        block,
        recordMap
      )

    const viewId =
      block?.view_ids?.[0]

    const collectionData =
      recordMap.collection_query?.[
        collectionId
      ]?.[viewId]

    const blockIds = (
      collectionData
        ?.collection_group_results
        ?.blockIds ||
      collectionData?.blockIds ||
      []
    ).map(normalizeNotionId)

    const savedState =
      readSavedState()

    const getRows = () => {
      if (!body) {
        return []
      }

      return Array.from(
        body.children
      ).filter(element =>
        element.classList.contains(
          'notion-table-row'
        )
      )
    }

    const removeInjectedElements = () => {
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

    const createStatusCell = (
      comicId
    ) => {
      const cell =
        document.createElement('div')

      cell.className = [
        'notion-table-cell',
        styles.statusCell
      ].join(' ')

      cell.dataset.comicReadCell =
        'true'

      cell.dataset.comicId =
        comicId

      const trigger =
        document.createElement('button')

      trigger.type = 'button'

      trigger.className =
        styles.trigger

      trigger.dataset.comicId =
        comicId

      trigger.setAttribute(
        'aria-haspopup',
        'menu'
      )

      trigger.setAttribute(
        'aria-expanded',
        'false'
      )

      renderTrigger(
        trigger,
        savedState[comicId] || ''
      )

      cell.appendChild(trigger)

      return cell
    }

    const ensureHeader = () => {
      if (!root || !body) {
        return
      }

      const rows = getRows()

      if (
        rows.length === 0 ||
        rows.some(
          row =>
            !row.querySelector(
              '[data-comic-read-cell]'
            )
        )
      ) {
        return
      }

      const headerInner =
        root.querySelector(
          '.notion-table-header-inner'
        )

      if (
        !headerInner ||
        headerInner.querySelector(
          '[data-comic-read-header]'
        )
      ) {
        return
      }

      const headerWrapper =
        document.createElement('div')

      headerWrapper.className = [
        'notion-table-th',
        styles.statusHeader
      ].join(' ')

      headerWrapper.dataset
        .comicReadHeader = 'true'

      const headerCell =
        document.createElement('div')

      headerCell.className = [
        'notion-table-view-header-cell',
        styles.statusHeaderCell
      ].join(' ')

      const headerInnerText =
        document.createElement('div')

      headerInnerText.className = [
        'notion-table-view-header-cell-inner',
        styles.statusHeaderInner
      ].join(' ')

      headerInnerText.textContent =
        '状态'

      headerCell.appendChild(
        headerInnerText
      )

      headerWrapper.appendChild(
        headerCell
      )

      headerInner.prepend(
        headerWrapper
      )
    }

    const addCellToRow = (
      row,
      rowIndex
    ) => {
      if (
        !row?.isConnected ||
        row.querySelector(
          '[data-comic-read-cell]'
        )
      ) {
        return
      }

      const comicId =
        blockIds[rowIndex] ||
        getFallbackComicId(
          row,
          rowIndex
        )

      row.prepend(
        createStatusCell(comicId)
      )
    }

    const runQueue = () => {
      if (
        disposed ||
        queueRunning ||
        queue.length === 0
      ) {
        return
      }

      queueRunning = true

      const processBatch = () => {
        if (disposed) {
          queueRunning = false
          return
        }

        const batch =
          queue.splice(0, 16)

        batch.forEach(
          ({ row, rowIndex }) => {
            addCellToRow(
              row,
              rowIndex
            )
          }
        )

        if (queue.length > 0) {
          batchFrame =
            window.requestAnimationFrame(
              processBatch
            )

          return
        }

        queueRunning = false
        ensureHeader()
      }

      processBatch()
    }

    const enqueueRows = rows => {
      const allRows = getRows()

      rows.forEach(row => {
        const rowIndex =
          allRows.indexOf(row)

        if (rowIndex < 0) {
          return
        }

        queue.push({
          row,
          rowIndex
        })
      })

      runQueue()
    }

    const handleRootClick = event => {
      const target =
        event.target instanceof Element
          ? event.target
          : null

      const trigger =
        target?.closest(
          `.${styles.trigger}`
        )

      if (
        !trigger ||
        !root?.contains(trigger)
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      openStatusMenu(
        trigger,
        trigger.dataset.comicId
      )
    }

    const attachToTable = (
      collectionRoot
    ) => {
      root = collectionRoot

      body = root.querySelector(
        '.notion-table-body'
      )

      const headerInner =
        root.querySelector(
          '.notion-table-header-inner'
        )

      if (!body || !headerInner) {
        return false
      }

      root.addEventListener(
        'click',
        handleRootClick
      )

      bodyObserver =
        new MutationObserver(
          mutations => {
            const addedRows = []

            mutations.forEach(
              mutation => {
                mutation.addedNodes.forEach(
                  node => {
                    if (
                      node.nodeType === 1 &&
                      node.classList.contains(
                        'notion-table-row'
                      )
                    ) {
                      addedRows.push(node)
                    }
                  }
                )
              }
            )

            if (addedRows.length > 0) {
              enqueueRows(addedRows)
            }
          }
        )

      bodyObserver.observe(body, {
        childList: true
      })

      enqueueRows(getRows())

      return true
    }

    const locateTable = () => {
      if (disposed) {
        return
      }

      const collectionRoot =
        document.querySelector(
          `.${collectionClassName}`
        )

      if (
        collectionRoot &&
        attachToTable(
          collectionRoot
        )
      ) {
        return
      }

      locateAttempts += 1

      if (locateAttempts < 100) {
        locateTimer =
          window.setTimeout(
            locateTable,
            100
          )
      }
    }

    locateTable()

    return () => {
      disposed = true

      window.clearTimeout(
        locateTimer
      )

      if (batchFrame !== null) {
        window.cancelAnimationFrame(
          batchFrame
        )
      }

      bodyObserver?.disconnect()

      root?.removeEventListener(
        'click',
        handleRootClick
      )

      closeActiveStatusMenu?.()
      closeActiveStatusMenu = null

      removeInjectedElements()
    }
  }, [
    block?.id,
    collectionClassName
  ])

  return (
    <OriginalCollection
      {...collectionProps}
      block={block}
      ctx={ctx}
      className={mergedClassName}
    />
  )
}

export default ComicCollectionTable
