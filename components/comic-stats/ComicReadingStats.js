import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconPhotoEdit,
} from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useComicAuth } from '@/components/comic-list/ComicAuthContext'
import { getComicEmailAvatar } from '@/components/comic-list/comicEmailAvatar'
import styles from './ComicReadingStats.module.css'

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const HEATMAP_WEEKDAYS = ['一', '', '三', '', '五', '', '日']

const normalizeComicId = (value) =>
  String(value || '')
    .replace(/-/g, '')
    .toLowerCase()

const pad2 = (value) => String(value).padStart(2, '0')

const getLocalDateKey = (value) => {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`
}

const formatMonthTitle = (date) =>
  `${date.getFullYear()}.${pad2(date.getMonth() + 1)}`

const getEmailInitial = (email) =>
  String(email || '')
    .trim()
    .charAt(0)
    .toUpperCase() || '?'

const formatDuration = (milliseconds) => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0m'

  const totalMinutes = Math.max(1, Math.round(milliseconds / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    return `${hours}h${minutes > 0 ? `${minutes}m` : ''}`
  }

  return `${minutes}m`
}

const getCalendarDays = (visibleMonth) => {
  const year = visibleMonth.getFullYear()
  const month = visibleMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const mondayIndex = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - mondayIndex)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    )

    return {
      date,
      key: getLocalDateKey(date),
      inCurrentMonth: date.getMonth() === month,
    }
  })
}

const getHeatmapDays = (year) => {
  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year, 11, 31)
  const startOffset = (yearStart.getDay() + 6) % 7
  const endOffset = 6 - ((yearEnd.getDay() + 6) % 7)
  const gridStart = new Date(year, 0, 1 - startOffset)
  const gridEnd = new Date(year, 11, 31 + endOffset)
  const dayCount =
    Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    )

    return {
      date,
      key: getLocalDateKey(date),
      inCurrentYear: date.getFullYear() === year,
    }
  })
}

const getHeatmapMonthLabels = (year, days) => {
  const gridStart = days[0]?.date
  if (!gridStart) return []

  return Array.from({ length: 12 }, (_, month) => {
    const monthStart = new Date(year, month, 1)
    const dayOffset = Math.round(
      (monthStart.getTime() - gridStart.getTime()) / 86400000,
    )

    return {
      month,
      label: `${month + 1}月`,
      week: Math.floor(dayOffset / 7),
    }
  })
}

const getHeatmapLevel = (count) => {
  if (count >= 4) return 4
  if (count === 3) return 3
  if (count === 2) return 2
  if (count === 1) return 1
  return 0
}

const resizeAvatarFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(new Error('头像读取失败。'))
    reader.onload = () => {
      const image = new Image()

      image.onerror = () => reject(new Error('头像图片无法打开。'))
      image.onload = () => {
        const size = 512
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size

        const context = canvas.getContext('2d')
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
        const sourceX = (image.naturalWidth - sourceSize) / 2
        const sourceY = (image.naturalHeight - sourceSize) / 2

        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          size,
          size,
        )

        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }

      image.src = String(reader.result || '')
    }

    reader.readAsDataURL(file)
  })

const fetchWithTimeout = async (url, timeout = 7000) => {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
    })
  } finally {
    window.clearTimeout(timer)
  }
}

const loadCanvasImage = async (source) => {
  if (!source) return null

  if (source.startsWith('data:') || source.startsWith('blob:')) {
    return await new Promise((resolve) => {
      const image = new Image()
      const timer = window.setTimeout(() => resolve(null), 5000)

      image.onload = () => {
        window.clearTimeout(timer)
        resolve(image)
      }
      image.onerror = () => {
        window.clearTimeout(timer)
        resolve(null)
      }
      image.src = source
    })
  }

  let objectUrl = ''

  try {
    const absoluteSource = new URL(source, window.location.origin)
    const requestSource =
      absoluteSource.origin === window.location.origin
        ? absoluteSource.toString()
        : `/api/comic-cover?url=${encodeURIComponent(absoluteSource.toString())}`

    const response = await fetchWithTimeout(requestSource)
    if (!response.ok) return null

    const blob = await response.blob()
    objectUrl = URL.createObjectURL(blob)

    return await new Promise((resolve) => {
      const image = new Image()
      const timer = window.setTimeout(() => resolve(null), 5000)

      image.onload = () => {
        window.clearTimeout(timer)
        resolve(image)
      }
      image.onerror = () => {
        window.clearTimeout(timer)
        resolve(null)
      }
      image.src = objectUrl
    })
  } catch {
    return null
  } finally {
    if (objectUrl) {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000)
    }
  }
}

const roundedRectPath = (context, x, y, width, height, radius) => {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))

  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}

const drawCoverImage = (context, image, x, y, width, height) => {
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height

  if (!imageWidth || !imageHeight) return

  const scale = Math.max(width / imageWidth, height / imageHeight)
  const sourceWidth = width / scale
  const sourceHeight = height / scale
  const sourceX = (imageWidth - sourceWidth) / 2
  const sourceY = (imageHeight - sourceHeight) / 2

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  )
}

const canvasToBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('图片生成失败。'))
    }, 'image/png')
  })

const renderStatsCanvas = async ({
  displayName,
  avatarUrl,
  completedCount,
  totalComicCount,
  completedPercent,
  totalDuration,
  visibleMonth,
  calendarDays,
  completedByDate,
  heatmapYear,
  heatmapDays,
  heatmapMonths,
  activityByDate,
}) => {
  if (document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ])
  }

  const width = 390
  const height = 930
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale

  const context = canvas.getContext('2d')
  context.scale(scale, scale)
  context.textBaseline = 'alphabetic'
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  context.fillStyle = '#fafafa'
  context.fillRect(0, 0, width, height)

  context.strokeStyle = '#d6d83a'
  context.lineWidth = 1
  context.strokeRect(10.5, 10.5, width - 21, height - 21)

  context.strokeStyle = '#151515'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(11, 26)
  context.lineTo(11, 11)
  context.lineTo(26, 11)
  context.stroke()

  context.save()
  context.globalAlpha = 0.045
  context.fillStyle = '#111111'
  context.font = '700 43px Inter, Arial, sans-serif'
  context.textAlign = 'right'
  context.fillText('TIMDRAKE', width - 24, 58)
  context.restore()

  const avatar = await loadCanvasImage(avatarUrl)
  const calendarImageEntries = []

  calendarDays.forEach((day) => {
    const comics = completedByDate.get(day.key) || []
    const comic =
      comics.find((item) => item.cover || item.proxyCover) || comics[0]
    const source = comic?.cover || comic?.proxyCover
    if (source) calendarImageEntries.push([day.key, source])
  })

  const uniqueSources = [
    ...new Set(calendarImageEntries.map(([, source]) => source)),
  ]
  const loadedImages = new Map(
    await Promise.all(
      uniqueSources.map(async (source) => [
        source,
        await loadCanvasImage(source),
      ]),
    ),
  )

  const left = 28
  const right = width - 28

  context.fillStyle = '#161616'
  context.textAlign = 'left'
  context.font = '600 21px Inter, Arial, sans-serif'
  const safeName = String(displayName || '').slice(0, 28)
  context.fillText(safeName, left, 92, 250)

  const avatarX = right - 68
  const avatarY = 46
  const avatarSize = 68
  context.save()
  context.beginPath()
  context.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2,
    0,
    Math.PI * 2,
  )
  context.clip()
  if (avatar) {
    drawCoverImage(context, avatar, avatarX, avatarY, avatarSize, avatarSize)
  } else {
    context.fillStyle = '#ededed'
    context.fillRect(avatarX, avatarY, avatarSize, avatarSize)
    context.fillStyle = '#161616'
    context.font = '600 24px Inter, Arial, sans-serif'
    context.textAlign = 'center'
    context.fillText(
      getEmailInitial(displayName),
      avatarX + avatarSize / 2,
      avatarY + 43,
    )
  }
  context.restore()

  const ringCenterX = 82
  const ringCenterY = 186
  const ringRadius = 43
  context.lineWidth = 11
  context.lineCap = 'round'
  context.strokeStyle = '#e8e8e3'
  context.beginPath()
  context.arc(ringCenterX, ringCenterY, ringRadius, 0, Math.PI * 2)
  context.stroke()

  context.strokeStyle = '#d6d83a'
  context.beginPath()
  context.arc(
    ringCenterX,
    ringCenterY,
    ringRadius,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * (completedPercent / 100),
  )
  context.stroke()

  context.lineCap = 'butt'
  context.fillStyle = '#161616'
  context.textAlign = 'left'
  context.font = '700 34px Inter, Arial, sans-serif'
  context.fillText(`${completedCount} / ${totalComicCount}`, 151, 184)
  context.font = '400 13px Inter, Arial, sans-serif'
  context.fillStyle = '#777777'
  context.fillText('已读完', 152, 207)

  const heatmapTop = 280
  context.fillStyle = '#777777'
  context.textAlign = 'right'
  context.font = '500 11px Inter, Arial, sans-serif'
  context.fillText(String(heatmapYear), right, heatmapTop)

  const heatmapLeft = 44
  const heatmapGridTop = heatmapTop + 25
  const cellSize = 5
  const cellGap = 1.25
  const heatmapColors = ['#ecece8', '#f2f2c4', '#e9ea91', '#dfe064', '#d6d83a']

  context.textAlign = 'left'
  context.font = '400 7px Inter, Arial, sans-serif'
  context.fillStyle = '#999999'
  heatmapMonths.forEach((month) => {
    const x = heatmapLeft + month.week * (cellSize + cellGap)
    context.fillText(month.label, x, heatmapGridTop - 8)
  })

  context.textAlign = 'right'
  HEATMAP_WEEKDAYS.forEach((label, row) => {
    if (!label) return
    const y = heatmapGridTop + row * (cellSize + cellGap) + cellSize
    context.fillText(label, heatmapLeft - 7, y)
  })

  heatmapDays.forEach((day, index) => {
    const column = Math.floor(index / 7)
    const row = index % 7
    const count = activityByDate.get(day.key) || 0
    const level = day.inCurrentYear ? getHeatmapLevel(count) : 0
    const x = heatmapLeft + column * (cellSize + cellGap)
    const y = heatmapGridTop + row * (cellSize + cellGap)

    context.fillStyle = day.inCurrentYear ? heatmapColors[level] : '#f5f5f2'
    roundedRectPath(context, x, y, cellSize, cellSize, 1.8)
    context.fill()
  })

  const calendarHeaderY = 414
  context.fillStyle = '#161616'
  context.textAlign = 'left'
  context.font = '700 27px Inter, Arial, sans-serif'
  context.fillText(formatMonthTitle(visibleMonth), left, calendarHeaderY)

  context.textAlign = 'right'
  context.font = '400 11px Inter, Arial, sans-serif'
  context.fillStyle = '#555555'
  context.fillText(
    `总时长 ${formatDuration(totalDuration)}`,
    right,
    calendarHeaderY - 10,
  )
  context.fillText(`读完 ${completedCount} 本`, right, calendarHeaderY + 8)

  const gridLeft = 18
  const gridTop = 448
  const gridWidth = width - 36
  const weekdayHeight = 30
  const rowHeight = 69
  const columnWidth = gridWidth / 7

  context.strokeStyle = '#c9c9c4'
  context.lineWidth = 0.8
  context.strokeRect(
    gridLeft,
    gridTop,
    gridWidth,
    weekdayHeight + rowHeight * 6,
  )

  context.font = '500 10px Inter, Arial, sans-serif'
  context.textAlign = 'center'
  context.fillStyle = '#696969'
  WEEKDAYS.forEach((weekday, index) => {
    context.fillText(
      weekday,
      gridLeft + columnWidth * index + columnWidth / 2,
      gridTop + 19,
    )
  })

  for (let column = 1; column < 7; column += 1) {
    const x = gridLeft + columnWidth * column
    context.beginPath()
    context.moveTo(x, gridTop)
    context.lineTo(x, gridTop + weekdayHeight + rowHeight * 6)
    context.stroke()
  }

  context.beginPath()
  context.moveTo(gridLeft, gridTop + weekdayHeight)
  context.lineTo(gridLeft + gridWidth, gridTop + weekdayHeight)
  context.stroke()

  for (let row = 1; row < 6; row += 1) {
    const y = gridTop + weekdayHeight + rowHeight * row
    context.beginPath()
    context.moveTo(gridLeft, y)
    context.lineTo(gridLeft + gridWidth, y)
    context.stroke()
  }

  calendarDays.forEach((day, index) => {
    const column = index % 7
    const row = Math.floor(index / 7)
    const x = gridLeft + columnWidth * column
    const y = gridTop + weekdayHeight + rowHeight * row
    const comics = completedByDate.get(day.key) || []
    const featuredComic =
      comics.find((comic) => comic.cover || comic.proxyCover) || comics[0]
    const source = featuredComic?.cover || featuredComic?.proxyCover
    const cover = source ? loadedImages.get(source) : null

    if (cover) {
      drawCoverImage(
        context,
        cover,
        x + 1,
        y + 1,
        columnWidth - 2,
        rowHeight - 2,
      )
    } else {
      context.fillStyle = day.inCurrentMonth ? '#353535' : '#b9b9b5'
      context.font = '500 13px Inter, Arial, sans-serif'
      context.textAlign = 'left'
      context.fillText(String(day.date.getDate()), x + 7, y + 18)
    }

    if (comics.length > 1) {
      const badgeText = `+${comics.length - 1}`
      context.font = '600 9px Inter, Arial, sans-serif'
      const badgeWidth = context.measureText(badgeText).width + 8
      const badgeX = x + columnWidth - badgeWidth - 4
      const badgeY = y + rowHeight - 17

      context.fillStyle = 'rgba(15,15,15,0.82)'
      roundedRectPath(context, badgeX, badgeY, badgeWidth, 13, 6.5)
      context.fill()
      context.fillStyle = '#ffffff'
      context.textAlign = 'center'
      context.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + 9.5)
    }
  })

  return canvasToBlob(canvas)
}

const ComicReadingStats = ({ comicCatalog = [] }) => {
  const { user, loading, initializationError, readingRecords } = useComicAuth()
  const nameInputRef = useRef(null)
  const [displayName, setDisplayName] = useState('')
  const [draftName, setDraftName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [localAvatar, setLocalAvatar] = useState('')
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [heatmapYear, setHeatmapYear] = useState(() => new Date().getFullYear())

  const normalizedCatalog = useMemo(
    () =>
      comicCatalog.map((item) => ({
        ...item,
        comicId: normalizeComicId(item.comicId),
      })),
    [comicCatalog],
  )

  const catalogById = useMemo(() => {
    const map = new Map()
    normalizedCatalog.forEach((item) => map.set(item.comicId, item))
    return map
  }, [normalizedCatalog])

  const records = useMemo(
    () =>
      Object.entries(readingRecords || {}).map(([comicId, record]) => ({
        ...record,
        comic_id: normalizeComicId(record?.comic_id || comicId),
      })),
    [readingRecords],
  )

  const finishedRecords = useMemo(
    () => records.filter((record) => record.status === 'finished'),
    [records],
  )

  const totalDuration = useMemo(
    () =>
      records.reduce((total, record) => {
        if (!record.started_at || !record.finished_at) return total

        const startedAt = new Date(record.started_at).getTime()
        const finishedAt = new Date(record.finished_at).getTime()
        const duration = finishedAt - startedAt

        return Number.isFinite(duration) && duration > 0
          ? total + duration
          : total
      }, 0),
    [records],
  )

  const completedByDate = useMemo(() => {
    const map = new Map()

    finishedRecords.forEach((record) => {
      const dateKey = getLocalDateKey(record.finished_at)
      if (!dateKey) return

      const comic = catalogById.get(record.comic_id) || {
        comicId: record.comic_id,
        title: '已读完漫画',
        cover: null,
        proxyCover: null,
      }

      const list = map.get(dateKey) || []
      list.push(comic)
      map.set(dateKey, list)
    })

    return map
  }, [catalogById, finishedRecords])

  const activityByDate = useMemo(() => {
    const map = new Map()

    records.forEach((record) => {
      const recordDays = new Set(
        [
          getLocalDateKey(record.started_at),
          getLocalDateKey(record.finished_at),
        ].filter(Boolean),
      )

      recordDays.forEach((dateKey) => {
        map.set(dateKey, (map.get(dateKey) || 0) + 1)
      })
    })

    return map
  }, [records])

  const heatmapDays = useMemo(() => getHeatmapDays(heatmapYear), [heatmapYear])
  const heatmapMonths = useMemo(
    () => getHeatmapMonthLabels(heatmapYear, heatmapDays),
    [heatmapDays, heatmapYear],
  )
  const heatmapWeekCount = Math.ceil(heatmapDays.length / 7)

  const calendarDays = useMemo(
    () => getCalendarDays(visibleMonth),
    [visibleMonth],
  )

  const totalComicCount = normalizedCatalog.length || records.length
  const completedCount = finishedRecords.length
  const completedPercent = totalComicCount
    ? Math.min(100, (completedCount / totalComicCount) * 100)
    : 0

  const providerAvatar =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    getComicEmailAvatar(user?.email)
  const avatarUrl = localAvatar || providerAvatar

  useEffect(() => {
    if (!user) return

    const nameKey = `comic-stats-name:${user.id}`
    const avatarKey = `comic-stats-avatar:${user.id}`
    const savedName = window.localStorage.getItem(nameKey)
    const savedAvatar = window.localStorage.getItem(avatarKey)
    const initialName = savedName || user.email || ''

    setDisplayName(initialName)
    setDraftName(initialName)
    setLocalAvatar(savedAvatar || '')
    setAvatarFailed(false)
  }, [user?.id, user?.email])

  useEffect(() => {
    if (isEditingName) nameInputRef.current?.focus()
  }, [isEditingName])

  useEffect(() => {
    const activityDates = records
      .flatMap((record) => [record.started_at, record.finished_at])
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())

    const latestActivity = activityDates[0]
    if (latestActivity) {
      setHeatmapYear(latestActivity.getFullYear())
    }

    const latestFinished = finishedRecords
      .map((record) => new Date(record.finished_at))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())[0]

    if (latestFinished) {
      setVisibleMonth(
        new Date(latestFinished.getFullYear(), latestFinished.getMonth(), 1),
      )
    }
  }, [finishedRecords, records])

  const saveDisplayName = () => {
    if (!user) return

    const nextName = draftName.trim() || user.email || ''
    setDisplayName(nextName)
    setDraftName(nextName)
    setIsEditingName(false)
    window.localStorage.setItem(`comic-stats-name:${user.id}`, nextName)
  }

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !user) return

    try {
      const resizedAvatar = await resizeAvatarFile(file)
      setLocalAvatar(resizedAvatar)
      setAvatarFailed(false)
      window.localStorage.setItem(
        `comic-stats-avatar:${user.id}`,
        resizedAvatar,
      )
    } catch (error) {
      window.alert(error?.message || '头像更换失败。')
    }
  }

  const handleExport = async () => {
    if (isExporting) return

    setIsExporting(true)

    try {
      const blob = await renderStatsCanvas({
        displayName: displayName || user.email,
        avatarUrl,
        completedCount,
        totalComicCount,
        completedPercent,
        totalDuration,
        visibleMonth,
        calendarDays,
        completedByDate,
        heatmapYear,
        heatmapDays,
        heatmapMonths,
        activityByDate,
      })
      const fileName = `timdrake-reading-${getLocalDateKey(new Date())}.png`
      const file = new File([blob], fileName, { type: 'image/png' })

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: '阅读统计' })
          return
        } catch (error) {
          if (error?.name === 'AbortError') return
          throw error
        }
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      console.error('[reading-stats] export failed:', error)
      window.alert('统计图生成失败，请稍后重试。')
    } finally {
      setIsExporting(false)
    }
  }

  if (loading) {
    return <main className={styles.statePage}>正在读取阅读记录……</main>
  }

  if (initializationError) {
    return <main className={styles.statePage}>{initializationError}</main>
  }

  if (!user) {
    return (
      <main className={styles.statePage}>
        <p>请先登录后查看阅读统计。</p>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.profileHeader}>
          <div className={styles.identity}>
            {isEditingName ? (
              <input
                ref={nameInputRef}
                className={styles.nameInput}
                value={draftName}
                maxLength={50}
                aria-label="编辑展示名称"
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={saveDisplayName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveDisplayName()
                  if (event.key === 'Escape') {
                    setDraftName(displayName)
                    setIsEditingName(false)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className={styles.displayName}
                title={user.email}
                onClick={() => setIsEditingName(true)}
              >
                {displayName || user.email}
              </button>
            )}
          </div>

          <label className={styles.avatarControl} title="点击更换展示头像">
            <input
              className={styles.avatarInput}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
            />

            {avatarUrl && !avatarFailed ? (
              <img
                className={styles.avatar}
                src={avatarUrl}
                alt="用户头像"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <span className={styles.avatarFallback}>
                {getEmailInitial(user.email)}
              </span>
            )}

            <span className={styles.avatarEditIcon} aria-hidden="true">
              <IconPhotoEdit size={15} stroke={1.7} />
            </span>
          </label>
        </header>

        <section className={styles.overview} aria-label="阅读完成进度">
          <div className={styles.ringWrap}>
            <svg
              className={styles.ring}
              viewBox="0 0 120 120"
              aria-hidden="true"
            >
              <circle className={styles.ringTrack} cx="60" cy="60" r="48" />
              <circle
                className={styles.ringProgress}
                cx="60"
                cy="60"
                r="48"
                pathLength="100"
                strokeDasharray={`${completedPercent} ${100 - completedPercent}`}
              />
            </svg>
          </div>

          <div className={styles.ringSummary}>
            <strong>
              {completedCount} / {totalComicCount}
            </strong>
            <span>已读完</span>
          </div>
        </section>

        <section className={styles.heatmapSection} aria-label="年度阅读活动">
          <div className={styles.heatmapToolbar}>
            <button
              type="button"
              className={styles.heatmapYearButton}
              aria-label="上一年"
              onClick={() => setHeatmapYear((current) => current - 1)}
            >
              <IconChevronLeft size={18} stroke={1.8} />
            </button>
            <strong>{heatmapYear}</strong>
            <button
              type="button"
              className={styles.heatmapYearButton}
              aria-label="下一年"
              onClick={() => setHeatmapYear((current) => current + 1)}
            >
              <IconChevronRight size={18} stroke={1.8} />
            </button>
          </div>

          <div className={styles.heatmapViewport}>
            <div className={styles.heatmapBody}>
              <div className={styles.heatmapWeekdays} aria-hidden="true">
                {HEATMAP_WEEKDAYS.map((weekday, index) => (
                  <span key={`${weekday}-${index}`}>{weekday}</span>
                ))}
              </div>

              <div className={styles.heatmapContent}>
                <div
                  className={styles.heatmapMonths}
                  style={{
                    gridTemplateColumns: `repeat(${heatmapWeekCount}, 12px)`,
                  }}
                  aria-hidden="true"
                >
                  {heatmapMonths.map((month) => (
                    <span
                      key={month.month}
                      style={{ gridColumnStart: month.week + 1 }}
                    >
                      {month.label}
                    </span>
                  ))}
                </div>

                <div
                  className={styles.heatmapGrid}
                  style={{
                    gridTemplateColumns: `repeat(${heatmapWeekCount}, 12px)`,
                  }}
                >
                  {heatmapDays.map((day) => {
                    const count = activityByDate.get(day.key) || 0
                    const level = getHeatmapLevel(count)

                    return (
                      <span
                        key={day.key}
                        className={[
                          styles.heatmapCell,
                          styles[`heatmapLevel${level}`],
                          !day.inCurrentYear ? styles.heatmapOutsideYear : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        title={`${day.key.replaceAll('-', '/')} · ${count} 次活动`}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.calendarSection}>
          <header className={styles.calendarHeader}>
            <div className={styles.monthActions}>
              <button
                type="button"
                className={styles.monthButton}
                aria-label="上个月"
                onClick={() =>
                  setVisibleMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() - 1,
                        1,
                      ),
                  )
                }
              >
                <IconChevronLeft size={20} stroke={1.8} />
              </button>

              <h2>{formatMonthTitle(visibleMonth)}</h2>

              <button
                type="button"
                className={styles.monthButton}
                aria-label="下个月"
                onClick={() =>
                  setVisibleMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() + 1,
                        1,
                      ),
                  )
                }
              >
                <IconChevronRight size={20} stroke={1.8} />
              </button>
            </div>

            <div className={styles.reportSummary}>
              <span>
                总时长 <strong>{formatDuration(totalDuration)}</strong>
              </span>
              <span>
                读完 <strong>{completedCount}</strong> 本
              </span>
            </div>
          </header>

          <div className={styles.weekdays}>
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className={styles.calendarGrid}>
            {calendarDays.map((day) => {
              const completedComics = completedByDate.get(day.key) || []
              const featuredComic =
                completedComics.find(
                  (comic) => comic.cover || comic.proxyCover,
                ) || completedComics[0]
              const hasCover = Boolean(
                featuredComic?.cover || featuredComic?.proxyCover,
              )

              return (
                <div
                  key={day.key}
                  className={[
                    styles.calendarCell,
                    !day.inCurrentMonth ? styles.outsideMonth : '',
                    hasCover ? styles.coverCell : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={completedComics.map((comic) => comic.title).join('、')}
                >
                  <span className={styles.dayNumber}>{day.date.getDate()}</span>

                  {hasCover && (
                    <img
                      className={styles.calendarCover}
                      src={featuredComic.cover || featuredComic.proxyCover}
                      data-fallback={featuredComic.proxyCover || ''}
                      alt={featuredComic.title}
                      loading="lazy"
                      onError={(event) => {
                        const image = event.currentTarget
                        const fallback = image.dataset.fallback

                        if (fallback && image.src !== fallback) {
                          image.dataset.fallback = ''
                          image.src = fallback
                          return
                        }

                        image.style.display = 'none'
                      }}
                    />
                  )}

                  {completedComics.length > 1 && (
                    <span className={styles.moreBadge}>
                      +{completedComics.length - 1}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <button
        type="button"
        className={styles.exportButton}
        disabled={isExporting}
        onClick={handleExport}
      >
        <IconDownload size={17} stroke={1.8} />
        {isExporting ? '正在生成……' : '保存统计图'}
      </button>
    </main>
  )
}

export default ComicReadingStats
