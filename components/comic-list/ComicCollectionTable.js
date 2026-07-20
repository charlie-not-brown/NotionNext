import { createElement, useEffect, useRef } from 'react'
import { getBlockCollectionId } from 'notion-utils'
import { useComicAuth } from './ComicAuthContext'
import styles from './ComicCollectionTable.module.css'

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

const STATUS_ORDER = ['want', 'reading', 'finished']
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

let closeActivePopover = null

const normalizeNotionId = id => {
  return String(id || '')
    .replace(/-/g, '')
    .toLowerCase()
}

const clearElement = element => {
  while (element.firstChild) {
    element.removeChild(element.firstChild)
  }
}

const pad2 = value => String(value).padStart(2, '0')

const parseDateTime = value => {
  if (!value) return null

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

const toIsoDateTime = value => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null
  }

  return value.toISOString()
}

const mergeSelectedDate = (selectedDate, previousValue) => {
  if (!(selectedDate instanceof Date) || Number.isNaN(selectedDate.getTime())) {
    return null
  }

  const timeSource =
    previousValue instanceof Date && !Number.isNaN(previousValue.getTime())
      ? previousValue
      : new Date()

  return new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds()
  )
}

const sameDay = (left, right) => {
  return Boolean(
    left instanceof Date &&
      right instanceof Date &&
      !Number.isNaN(left.getTime()) &&
      !Number.isNaN(right.getTime()) &&
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
  )
}

const formatChineseDate = value => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '未设置'
  }

  return `${value.getFullYear()}/${pad2(value.getMonth() + 1)}/${pad2(
    value.getDate()
  )}`
}

const formatChineseDateTime = value => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '未设置'
  }

  return `${formatChineseDate(value)} ${pad2(value.getHours())}:${pad2(
    value.getMinutes()
  )}`
}

const formatDateRange = record => {
  const startedAt = parseDateTime(record?.started_at)
  const finishedAt = parseDateTime(record?.finished_at)

  // 没有任何日期时，单元格保持空白
  if (!startedAt && !finishedAt) {
    return ''
  }

  // 同时有开始和结束日期
  if (startedAt && finishedAt) {
    // 当天开始并当天读完，只显示一个日期
    if (sameDay(startedAt, finishedAt)) {
      return formatChineseDate(startedAt)
    }

    return `${formatChineseDate(startedAt)}-${formatChineseDate(
      finishedAt
    )}`
  }

  // 只有开始日期，表示仍在阅读
  if (startedAt) {
    return `${formatChineseDate(startedAt)} →`
  }

  // 只有结束日期，直接显示完成日期
  return formatChineseDate(finishedAt)
}

const removeInjectedElementsForCollection = collectionClassName => {
  if (typeof document === 'undefined') return

  const root = document.querySelector(`.${collectionClassName}`)

  root
    ?.querySelectorAll(
      [
        '[data-comic-control-header]',
        '[data-comic-control-cell]'
      ].join(',')
    )
    .forEach(element => {
      element.remove()
    })

  closeActivePopover?.()
  closeActivePopover = null
}

const createPill = status => {
  const meta = STATUS_META[status]
  if (!meta) return null

  const pill = document.createElement('span')
  pill.className = [styles.pill, meta.className].join(' ')

  const dot = document.createElement('span')
  dot.className = styles.dot

  const label = document.createElement('span')
  label.className = styles.label
  label.textContent = meta.label

  pill.appendChild(dot)
  pill.appendChild(label)

  return pill
}

const renderStatusTrigger = (trigger, status) => {
  clearElement(trigger)

  trigger.dataset.status = status || ''
  trigger.classList.toggle(styles.empty, !status)

  const meta = STATUS_META[status]

  if (!meta) {
    trigger.setAttribute('aria-label', '设置阅读状态')
    trigger.title = '设置阅读状态'
    return
  }

  trigger.setAttribute('aria-label', `当前状态：${meta.label}`)
  trigger.title = meta.label

  const pill = createPill(status)
  if (pill) trigger.appendChild(pill)
}

const renderRatingTrigger = (trigger, rating) => {
  const normalizedRating = Number.isInteger(Number(rating))
    ? Number(rating)
    : 0

  clearElement(trigger)
  trigger.dataset.rating = String(normalizedRating || '')
  trigger.setAttribute(
    'aria-label',
    normalizedRating ? `当前评分：${normalizedRating} 星` : '设置评分'
  )
  trigger.title = normalizedRating ? `${normalizedRating} 星` : '设置评分'
  trigger.classList.toggle(styles.ratingEmpty, !normalizedRating)

  if (!normalizedRating) return

  for (let index = 1; index <= normalizedRating; index += 1) {
    const star = document.createElement('span')
    star.className = [styles.star, styles.starActive].join(' ')
    star.textContent = '★'
    trigger.appendChild(star)
  }
}

const renderDateTrigger = (trigger, record) => {
  const text = formatDateRange(record)

  clearElement(trigger)
  trigger.dataset.hasDate = text ? 'true' : 'false'
  trigger.classList.toggle(styles.dateEmpty, !text)
  trigger.textContent = text
  trigger.setAttribute('aria-label', text ? `阅读日期：${text}` : '设置阅读日期')
  trigger.title = text || '设置阅读日期'
}

const positionPopover = (trigger, popover, preferredWidth) => {
  const pagePadding = 12
  const rect = trigger.getBoundingClientRect()
  const availableWidth = Math.max(240, window.innerWidth - pagePadding * 2)
  const width = Math.min(preferredWidth, availableWidth)

  popover.style.width = `${width}px`

  let left = rect.left
  let top = rect.bottom + 6

  if (left + width > window.innerWidth - pagePadding) {
    left = window.innerWidth - width - pagePadding
  }

  popover.style.left = `${Math.max(pagePadding, left)}px`
  popover.style.top = `${top}px`

  const popoverRect = popover.getBoundingClientRect()

  if (popoverRect.bottom > window.innerHeight - pagePadding) {
    top = rect.top - popoverRect.height - 6
    popover.style.top = `${Math.max(pagePadding, top)}px`
  }
}

const mountPopover = ({
  trigger,
  popover,
  preferredWidth,
  onEscape,
  closeOnScroll = true
}) => {
  closeActivePopover?.()

  document.body.appendChild(popover)

  let isOpen = true

  const closePopover = () => {
    if (!isOpen) return

    isOpen = false
    popover.remove()
    trigger.setAttribute('aria-expanded', 'false')

    document.removeEventListener('pointerdown', handleOutsideClick, true)
    document.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('resize', closePopover)

    if (closeOnScroll) {
      window.removeEventListener('scroll', closePopover, true)
    }

    if (closeActivePopover === closePopover) {
      closeActivePopover = null
    }
  }

  const handleOutsideClick = event => {
    if (popover.contains(event.target) || trigger.contains(event.target)) return
    closePopover()
  }

  const handleKeyDown = event => {
    if (event.key !== 'Escape') return

    if (typeof onEscape === 'function') onEscape()
    closePopover()
    trigger.focus()
  }

  positionPopover(trigger, popover, preferredWidth)
  trigger.setAttribute('aria-expanded', 'true')

  document.addEventListener('pointerdown', handleOutsideClick, true)
  document.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', closePopover)

  if (closeOnScroll) {
    window.addEventListener('scroll', closePopover, true)
  }

  closeActivePopover = closePopover
  return closePopover
}

const openStatusMenu = (trigger, comicId, saveReadingStatus) => {
  const menu = document.createElement('div')
  menu.className = styles.menu

  let closeMenu = null

  const applyStatus = async nextStatus => {
    trigger.disabled = true

    const { error } = await saveReadingStatus(comicId, nextStatus)

    trigger.disabled = false

    if (error) {
      window.alert(`阅读状态保存失败：${error.message}`)
      return
    }

    renderStatusTrigger(trigger, nextStatus)
    closeMenu?.()
  }

  STATUS_ORDER.forEach(status => {
    const option = document.createElement('button')
    option.type = 'button'
    option.className = styles.option

    if (trigger.dataset.status === status) {
      option.classList.add(styles.current)
    }

    const pill = createPill(status)
    if (pill) option.appendChild(pill)

    option.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      void applyStatus(status)
    })

    menu.appendChild(option)
  })

  if (trigger.dataset.status) {
    const clearButton = document.createElement('button')
    clearButton.type = 'button'
    clearButton.className = styles.clearButton
    clearButton.textContent = '清除'

    clearButton.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      void applyStatus('')
    })

    menu.appendChild(clearButton)
  }

  closeMenu = mountPopover({
    trigger,
    popover: menu,
    preferredWidth: 136
  })
}

const openRatingMenu = (trigger, comicId, saveRating) => {
  const menu = document.createElement('div')
  menu.className = [styles.menu, styles.ratingMenu].join(' ')

  let closeMenu = null
  const currentRating = Number(trigger.dataset.rating || 0)

  const applyRating = async nextRating => {
    trigger.disabled = true

    const { error } = await saveRating(comicId, nextRating)

    trigger.disabled = false

    if (error) {
      window.alert(`评分保存失败：${error.message}`)
      return
    }

    renderRatingTrigger(trigger, nextRating)
    closeMenu?.()
  }

  for (let rating = 5; rating >= 1; rating -= 1) {
    const option = document.createElement('button')
    option.type = 'button'
    option.className = [
      styles.option,
      styles.ratingOption,
      currentRating === rating ? styles.current : ''
    ]
      .filter(Boolean)
      .join(' ')

    const stars = document.createElement('span')
    stars.className = styles.ratingOptionStars
    stars.textContent = '★'.repeat(rating)

    const label = document.createElement('span')
    label.className = styles.ratingOptionLabel
    label.textContent = `${rating} 星`

    option.appendChild(stars)
    option.appendChild(label)

    option.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      void applyRating(rating)
    })

    menu.appendChild(option)
  }

  if (currentRating) {
    const clearButton = document.createElement('button')
    clearButton.type = 'button'
    clearButton.className = styles.clearButton
    clearButton.textContent = '清除评分'

    clearButton.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      void applyRating(null)
    })

    menu.appendChild(clearButton)
  }

  closeMenu = mountPopover({
    trigger,
    popover: menu,
    preferredWidth: 164
  })
}

const createDateFieldButton = ({ label, value, active, onClick }) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = [
    styles.dateField,
    active ? styles.dateFieldActive : ''
  ]
    .filter(Boolean)
    .join(' ')

  const labelElement = document.createElement('span')
  labelElement.className = styles.dateFieldLabel
  labelElement.textContent = label

  const valueElement = document.createElement('span')
  valueElement.className = styles.dateFieldValue
  valueElement.textContent = value

  button.appendChild(labelElement)
  button.appendChild(valueElement)
  button.addEventListener('click', onClick)

  return button
}

const openDatePanel = ({
  trigger,
  comicId,
  record,
  saveReadingDates
}) => {
  const panel = document.createElement('div')
  panel.className = styles.datePanel

  let startedAt = parseDateTime(record?.started_at)
  let finishedAt = parseDateTime(record?.finished_at)
  let activeField = !startedAt
    ? 'started'
    : !finishedAt
      ? 'finished'
      : 'started'
  const initialDate = activeField === 'started' ? startedAt : finishedAt
  const now = new Date()
  let visibleMonth = initialDate
    ? new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
    : new Date(now.getFullYear(), now.getMonth(), 1)

  let closePanel = null
  let isSaving = false

  const getActiveValue = () => {
    return activeField === 'started' ? startedAt : finishedAt
  }

  const persistDates = async ({ closeAfterSave = false } = {}) => {
    if (isSaving) return false

    isSaving = true
    panel.classList.add(styles.datePanelSaving)

    const { error } = await saveReadingDates(comicId, {
      startedAt: toIsoDateTime(startedAt),
      finishedAt: toIsoDateTime(finishedAt)
    })

    isSaving = false
    panel.classList.remove(styles.datePanelSaving)

    if (error) {
      window.alert(`阅读日期保存失败：${error.message}`)
      return false
    }

    renderDateTrigger(trigger, {
      started_at: toIsoDateTime(startedAt),
      finished_at: toIsoDateTime(finishedAt)
    })

    if (closeAfterSave) {
      closePanel?.()
    }

    return true
  }

  const chooseDate = async date => {
    if (isSaving) return

    if (activeField === 'started') {
      const nextStartedAt = mergeSelectedDate(date, startedAt)

      if (!nextStartedAt) return

      startedAt = nextStartedAt

      if (
        finishedAt &&
        new Date(
          finishedAt.getFullYear(),
          finishedAt.getMonth(),
          finishedAt.getDate()
        ).getTime() <
          new Date(
            startedAt.getFullYear(),
            startedAt.getMonth(),
            startedAt.getDate()
          ).getTime()
      ) {
        finishedAt = null
      }

      if (!finishedAt) {
        activeField = 'finished'
      }
    } else {
      const nextFinishedAt = mergeSelectedDate(date, finishedAt)

      if (!nextFinishedAt) return

      if (
        startedAt &&
        new Date(
          nextFinishedAt.getFullYear(),
          nextFinishedAt.getMonth(),
          nextFinishedAt.getDate()
        ).getTime() <
          new Date(
            startedAt.getFullYear(),
            startedAt.getMonth(),
            startedAt.getDate()
          ).getTime()
      ) {
        window.alert('结束日期不能早于开始日期。')
        return
      }

      finishedAt = nextFinishedAt
    }

    renderPanel()
    await persistDates()
  }

  const renderPanel = () => {
    clearElement(panel)

    const fields = document.createElement('div')
    fields.className = styles.dateFields

    fields.appendChild(
      createDateFieldButton({
        label: '开始日期',
        value: formatChineseDateTime(startedAt),
        active: activeField === 'started',
        onClick: () => {
          activeField = 'started'
          const source = startedAt || new Date()
          visibleMonth = new Date(source.getFullYear(), source.getMonth(), 1)
          renderPanel()
        }
      })
    )

    fields.appendChild(
      createDateFieldButton({
        label: '结束日期',
        value: formatChineseDateTime(finishedAt),
        active: activeField === 'finished',
        onClick: () => {
          activeField = 'finished'
          const source = finishedAt || startedAt || new Date()
          visibleMonth = new Date(source.getFullYear(), source.getMonth(), 1)
          renderPanel()
        }
      })
    )

    panel.appendChild(fields)

    const monthHeader = document.createElement('div')
    monthHeader.className = styles.monthHeader

    const monthLabel = document.createElement('div')
    monthLabel.className = styles.monthLabel
    monthLabel.textContent = `${visibleMonth.getFullYear()}年${
      visibleMonth.getMonth() + 1
    }月`

    const monthActions = document.createElement('div')
    monthActions.className = styles.monthActions

    const previousMonth = document.createElement('button')
    previousMonth.type = 'button'
    previousMonth.className = styles.monthNav
    previousMonth.textContent = '‹'
    previousMonth.setAttribute('aria-label', '上个月')
    previousMonth.addEventListener('click', () => {
      visibleMonth = new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth() - 1,
        1
      )
      renderPanel()
    })

    const nextMonth = document.createElement('button')
    nextMonth.type = 'button'
    nextMonth.className = styles.monthNav
    nextMonth.textContent = '›'
    nextMonth.setAttribute('aria-label', '下个月')
    nextMonth.addEventListener('click', () => {
      visibleMonth = new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth() + 1,
        1
      )
      renderPanel()
    })

    monthActions.appendChild(previousMonth)
    monthActions.appendChild(nextMonth)
    monthHeader.appendChild(monthLabel)
    monthHeader.appendChild(monthActions)
    panel.appendChild(monthHeader)

    const weekdayRow = document.createElement('div')
    weekdayRow.className = styles.weekdayRow

    WEEKDAYS.forEach(weekday => {
      const weekdayElement = document.createElement('span')
      weekdayElement.textContent = weekday
      weekdayRow.appendChild(weekdayElement)
    })

    panel.appendChild(weekdayRow)

    const calendarGrid = document.createElement('div')
    calendarGrid.className = styles.calendarGrid

    const firstWeekday = (visibleMonth.getDay() + 6) % 7
    const gridStart = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1 - firstWeekday
    )
    const today = new Date()

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + index
      )
      const button = document.createElement('button')
      button.type = 'button'
      button.className = styles.calendarDay
      button.textContent = String(date.getDate())

      if (date.getMonth() !== visibleMonth.getMonth()) {
        button.classList.add(styles.calendarOutside)
      }

      if (sameDay(date, today)) {
        button.classList.add(styles.calendarToday)
      }

      if (sameDay(date, startedAt)) {
        button.classList.add(styles.calendarStart)
      }

      if (sameDay(date, finishedAt)) {
        button.classList.add(styles.calendarEnd)
      }

      if (
        startedAt &&
        finishedAt &&
        date.getTime() > startedAt.getTime() &&
        date.getTime() < finishedAt.getTime()
      ) {
        button.classList.add(styles.calendarRange)
      }

      button.addEventListener('click', () => {
        void chooseDate(date)
      })
      calendarGrid.appendChild(button)
    }

    panel.appendChild(calendarGrid)

    const clearButton = document.createElement('button')
    clearButton.type = 'button'
    clearButton.className = styles.dateClearButton
    clearButton.textContent = '清除'
    clearButton.disabled = (!startedAt && !finishedAt) || isSaving
    clearButton.addEventListener('click', async () => {
      if (isSaving) return

      startedAt = null
      finishedAt = null
      activeField = 'started'
      renderPanel()
      await persistDates({ closeAfterSave: true })
    })

    panel.appendChild(clearButton)
  }

  renderPanel()

  closePanel = mountPopover({
    trigger,
    popover: panel,
    preferredWidth: 312
  })
}

const createHeader = ({ label, headerClass, cellClass, innerClass, key }) => {
  const headerWrapper = document.createElement('div')
  headerWrapper.className = ['notion-table-th', headerClass].join(' ')
  headerWrapper.dataset.comicControlHeader = key

  const headerCell = document.createElement('div')
  headerCell.className = ['notion-table-view-header-cell', cellClass].join(' ')

  const headerInner = document.createElement('div')
  headerInner.className = [
    'notion-table-view-header-cell-inner',
    innerClass
  ].join(' ')
  headerInner.textContent = label

  headerCell.appendChild(headerInner)
  headerWrapper.appendChild(headerCell)

  return headerWrapper
}

const createStatusCell = (comicId, record) => {
  const cell = document.createElement('div')
  cell.className = ['notion-table-cell', styles.statusCell].join(' ')
  cell.dataset.comicControlCell = 'status'
  cell.dataset.comicId = comicId

  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = styles.trigger
  trigger.dataset.comicStatusTrigger = 'true'
  trigger.dataset.comicId = comicId
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')

  renderStatusTrigger(trigger, record?.status || '')
  cell.appendChild(trigger)

  return cell
}

const createRatingCell = (comicId, record) => {
  const cell = document.createElement('div')
  cell.className = ['notion-table-cell', styles.ratingCell].join(' ')
  cell.dataset.comicControlCell = 'rating'
  cell.dataset.comicId = comicId

  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = styles.ratingTrigger
  trigger.dataset.comicRatingTrigger = 'true'
  trigger.dataset.comicId = comicId
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')

  renderRatingTrigger(trigger, record?.rating)
  cell.appendChild(trigger)

  return cell
}

const createDateCell = (comicId, record) => {
  const cell = document.createElement('div')
  cell.className = ['notion-table-cell', styles.dateCell].join(' ')
  cell.dataset.comicControlCell = 'date'
  cell.dataset.comicId = comicId

  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = styles.dateTrigger
  trigger.dataset.comicDateTrigger = 'true'
  trigger.dataset.comicId = comicId
  trigger.setAttribute('aria-haspopup', 'dialog')
  trigger.setAttribute('aria-expanded', 'false')

  renderDateTrigger(trigger, record)
  cell.appendChild(trigger)

  return cell
}

const getFallbackComicId = row => {
  const links = row.querySelectorAll('a[href]')

  for (const link of links) {
    const href = link.getAttribute('href') || ''
    const match = href.match(/([a-f0-9-]{32,36})(?:[/?#]|$)/i)
    const comicId = normalizeNotionId(match?.[1])

    if (/^[a-f0-9]{32}$/.test(comicId)) return comicId
  }

  return null
}

const ComicCollectionTable = ({
  OriginalCollection,
  databaseId,
  block,
  ctx,
  ...collectionProps
}) => {
  const {
    user,
    loading,
    readingRecords,
    readingStatusesLoading,
    saveReadingStatus,
    saveRating,
    saveReadingDates
  } = useComicAuth()

  const recordsRef = useRef(readingRecords)
  const actionsRef = useRef({
    saveReadingStatus,
    saveRating,
    saveReadingDates
  })

  const collectionClassName = `comic-collection-${normalizeNotionId(
    databaseId
  )}`
  const mergedClassName = [collectionProps.className, collectionClassName]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    recordsRef.current = readingRecords

    const root = document.querySelector(`.${collectionClassName}`)
    if (!root) return

    root.querySelectorAll('[data-comic-status-trigger]').forEach(trigger => {
      const comicId = trigger.dataset.comicId
      renderStatusTrigger(trigger, readingRecords[comicId]?.status || '')
    })

    root.querySelectorAll('[data-comic-rating-trigger]').forEach(trigger => {
      const comicId = trigger.dataset.comicId
      renderRatingTrigger(trigger, readingRecords[comicId]?.rating)
    })

    root.querySelectorAll('[data-comic-date-trigger]').forEach(trigger => {
      const comicId = trigger.dataset.comicId
      renderDateTrigger(trigger, readingRecords[comicId])
    })
  }, [collectionClassName, readingRecords])

  useEffect(() => {
    actionsRef.current = {
      saveReadingStatus,
      saveRating,
      saveReadingDates
    }
  }, [saveRating, saveReadingDates, saveReadingStatus])

  useEffect(() => {
    if (loading || readingStatusesLoading || user) return
    removeInjectedElementsForCollection(collectionClassName)
  }, [
    collectionClassName,
    loading,
    readingStatusesLoading,
    user?.id
  ])

  useEffect(() => {
    if (loading || readingStatusesLoading || !user) {
      removeInjectedElementsForCollection(collectionClassName)
      return
    }

    if (!block || !ctx?.recordMap) return

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
    const collectionId = getBlockCollectionId(block, recordMap)
    const viewId = block?.view_ids?.[0]
    const collectionData = recordMap.collection_query?.[collectionId]?.[viewId]
    const blockIds = (
      collectionData?.collection_group_results?.blockIds ||
      collectionData?.blockIds ||
      []
    ).map(normalizeNotionId)

    const getRows = () => {
      if (!body) return []

      return Array.from(body.children).filter(element =>
        element.classList.contains('notion-table-row')
      )
    }

    const removeInjectedElements = () => {
      root
        ?.querySelectorAll(
          [
            '[data-comic-control-header]',
            '[data-comic-control-cell]'
          ].join(',')
        )
        .forEach(element => {
          element.remove()
        })
    }

    const ensureHeader = () => {
      if (!root || !body) return

      const rows = getRows()

      if (
        rows.length === 0 ||
        rows.some(
          row => row.querySelectorAll('[data-comic-control-cell]').length !== 3
        )
      ) {
        return
      }

      const headerInner = root.querySelector('.notion-table-header-inner')

      if (
        !headerInner ||
        headerInner.querySelector('[data-comic-control-header]')
      ) {
        return
      }

      const statusHeader = createHeader({
        label: '状态',
        key: 'status',
        headerClass: styles.statusHeader,
        cellClass: styles.statusHeaderCell,
        innerClass: styles.headerInner
      })
      const ratingHeader = createHeader({
        label: '评分',
        key: 'rating',
        headerClass: styles.ratingHeader,
        cellClass: styles.ratingHeaderCell,
        innerClass: styles.headerInner
      })
      const dateHeader = createHeader({
        label: '阅读日期',
        key: 'date',
        headerClass: styles.dateHeader,
        cellClass: styles.dateHeaderCell,
        innerClass: styles.headerInner
      })

      headerInner.prepend(statusHeader)
      headerInner.append(ratingHeader, dateHeader)
    }

    const addCellsToRow = (row, rowIndex) => {
      if (!row?.isConnected) return

      const currentCells = row.querySelectorAll('[data-comic-control-cell]')

      if (currentCells.length === 3) return

      currentCells.forEach(element => element.remove())

      const comicId = blockIds[rowIndex] || getFallbackComicId(row)

      if (!comicId) {
        console.warn(
          '[ComicCollectionTable] 无法读取漫画的 Notion 页面 ID',
          rowIndex
        )
        return
      }

      const record = recordsRef.current[comicId] || null

      row.prepend(
        createStatusCell(comicId, record)
      )

      row.append(
        createRatingCell(comicId, record),
        createDateCell(comicId, record)
      )
    }

    const runQueue = () => {
      if (disposed || queueRunning || queue.length === 0) return

      queueRunning = true

      const processBatch = () => {
        if (disposed) {
          queueRunning = false
          return
        }

        const batch = queue.splice(0, 16)

        batch.forEach(({ row, rowIndex }) => {
          addCellsToRow(row, rowIndex)
        })

        if (queue.length > 0) {
          batchFrame = window.requestAnimationFrame(processBatch)
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
        const rowIndex = allRows.indexOf(row)
        if (rowIndex < 0) return

        queue.push({ row, rowIndex })
      })

      runQueue()
    }

    const handleRootClick = event => {
      const target = event.target instanceof Element ? event.target : null
      if (!target || !root?.contains(target)) return

      const statusTrigger = target.closest('[data-comic-status-trigger]')

      if (statusTrigger) {
        event.preventDefault()
        event.stopPropagation()
        openStatusMenu(
          statusTrigger,
          statusTrigger.dataset.comicId,
          actionsRef.current.saveReadingStatus
        )
        return
      }

      const ratingTrigger = target.closest('[data-comic-rating-trigger]')

      if (ratingTrigger) {
        event.preventDefault()
        event.stopPropagation()
        openRatingMenu(
          ratingTrigger,
          ratingTrigger.dataset.comicId,
          actionsRef.current.saveRating
        )
        return
      }

      const dateTrigger = target.closest('[data-comic-date-trigger]')

      if (dateTrigger) {
        event.preventDefault()
        event.stopPropagation()

        const comicId = dateTrigger.dataset.comicId

        openDatePanel({
          trigger: dateTrigger,
          comicId,
          record: recordsRef.current[comicId],
          saveReadingDates: actionsRef.current.saveReadingDates
        })
      }
    }

    const attachToTable = collectionRoot => {
      root = collectionRoot
      body = root.querySelector('.notion-table-body')
      const headerInner = root.querySelector('.notion-table-header-inner')

      if (!body || !headerInner) return false

      root.addEventListener('click', handleRootClick)

      bodyObserver = new MutationObserver(mutations => {
        const addedRows = []

        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (
              node.nodeType === 1 &&
              node.classList.contains('notion-table-row')
            ) {
              addedRows.push(node)
            }
          })
        })

        if (addedRows.length > 0) enqueueRows(addedRows)
      })

      bodyObserver.observe(body, {
        childList: true
      })

      enqueueRows(getRows())
      return true
    }

    const locateTable = () => {
      if (disposed) return

      const collectionRoot = document.querySelector(`.${collectionClassName}`)

      if (collectionRoot && attachToTable(collectionRoot)) return

      locateAttempts += 1

      if (locateAttempts < 100) {
        locateTimer = window.setTimeout(locateTable, 100)
      }
    }

    locateTable()

    return () => {
      disposed = true
      window.clearTimeout(locateTimer)

      if (batchFrame !== null) {
        window.cancelAnimationFrame(batchFrame)
      }

      bodyObserver?.disconnect()
      root?.removeEventListener('click', handleRootClick)
      closeActivePopover?.()
      closeActivePopover = null
      removeInjectedElements()
    }
  }, [
    block?.id,
    collectionClassName,
    loading,
    readingStatusesLoading,
    user?.id
  ])

  return createElement(OriginalCollection, {
    ...collectionProps,
    block,
    ctx,
    className: mergedClassName
  })
}

export default ComicCollectionTable
