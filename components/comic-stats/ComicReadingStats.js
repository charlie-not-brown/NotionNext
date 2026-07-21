import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconPhotoEdit
} from '@tabler/icons-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useComicAuth } from '@/components/comic-list/ComicAuthContext'
import { getComicEmailAvatar } from '@/components/comic-list/comicEmailAvatar'
import styles from './ComicReadingStats.module.css'

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const normalizeComicId = value =>
  String(value || '')
    .replace(/-/g, '')
    .toLowerCase()

const pad2 = value => String(value).padStart(2, '0')

const getLocalDateKey = value => {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`
}

const formatMonthTitle = date =>
  `${date.getFullYear()}.${pad2(date.getMonth() + 1)}`

const getEmailInitial = email =>
  String(email || '')
    .trim()
    .charAt(0)
    .toUpperCase() || '?'

const formatDuration = milliseconds => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0m'

  const totalMinutes = Math.max(1, Math.round(milliseconds / 60000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    return [
      `${days}d`,
      hours > 0 ? `${hours}h` : '',
      minutes > 0 ? `${minutes}m` : ''
    ]
      .filter(Boolean)
      .join('')
  }

  if (hours > 0) {
    return `${hours}h${minutes > 0 ? `${minutes}m` : ''}`
  }

  return `${minutes}m`
}

const getCalendarDays = visibleMonth => {
  const year = visibleMonth.getFullYear()
  const month = visibleMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const mondayIndex = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - mondayIndex)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index
    )

    return {
      date,
      key: getLocalDateKey(date),
      inCurrentMonth: date.getMonth() === month
    }
  })
}

const HEATMAP_WEEKDAYS = ['一', '', '三', '', '五', '', '日']

const getHeatmapDays = year => {
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
      gridStart.getDate() + index
    )

    return {
      date,
      key: getLocalDateKey(date),
      inCurrentYear: date.getFullYear() === year
    }
  })
}

const getHeatmapMonthLabels = (year, days) => {
  const gridStart = days[0]?.date
  if (!gridStart) return []

  return Array.from({ length: 12 }, (_, month) => {
    const monthStart = new Date(year, month, 1)
    const dayOffset = Math.round(
      (monthStart.getTime() - gridStart.getTime()) / 86400000
    )

    return {
      month,
      label: `${month + 1}月`,
      week: Math.floor(dayOffset / 7)
    }
  })
}

const getHeatmapLevel = count => {
  if (count >= 4) return 4
  if (count === 3) return 3
  if (count === 2) return 2
  if (count === 1) return 1
  return 0
}

const resizeAvatarFile = file =>
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
          size
        )

        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }

      image.src = String(reader.result || '')
    }

    reader.readAsDataURL(file)
  })

const blobToDataUrl = blob =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })

const inlineCloneImages = async root => {
  const images = Array.from(root.querySelectorAll('img'))

  await Promise.all(
    images.map(async image => {
      const source = image.currentSrc || image.src
      if (!source || source.startsWith('data:')) return

      try {
        const absoluteSource = new URL(source, window.location.origin)
        const requestSource =
          absoluteSource.origin === window.location.origin
            ? absoluteSource.toString()
            : `/api/comic-cover?url=${encodeURIComponent(
                absoluteSource.toString()
              )}`
        const response = await fetch(requestSource)
        if (!response.ok) throw new Error('image request failed')
        const dataUrl = await blobToDataUrl(await response.blob())
        image.src = String(dataUrl)
      } catch {
        image.removeAttribute('src')
        image.style.display = 'none'
      }
    })
  )
}

const inlineComputedStyles = root => {
  const elements = [root, ...root.querySelectorAll('*')]
  const snapshots = elements.map(element => {
    const computed = window.getComputedStyle(element)
    const rules = []

    for (let index = 0; index < computed.length; index += 1) {
      const property = computed[index]
      const value = computed.getPropertyValue(property)
      const priority = computed.getPropertyPriority(property)
      rules.push([property, value, priority])
    }

    return rules
  })

  elements.forEach((element, elementIndex) => {
    snapshots[elementIndex].forEach(([property, value, priority]) => {
      element.style.setProperty(property, value, priority)
    })
  })
}

const waitForImages = async root => {
  const images = Array.from(root.querySelectorAll('img'))

  await Promise.all(
    images.map(image => {
      if (image.complete) return Promise.resolve()

      return new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      })
    })
  )
}

const exportNodeToPng = async sourceNode => {
  const exportHost = document.createElement('div')
  exportHost.style.position = 'fixed'
  exportHost.style.left = '-10000px'
  exportHost.style.top = '0'
  exportHost.style.width = '390px'
  exportHost.style.pointerEvents = 'none'
  exportHost.style.zIndex = '-1'

  const clone = sourceNode.cloneNode(true)
  clone.setAttribute('data-export-mode', 'true')
  clone.style.width = '390px'
  clone.style.maxWidth = '390px'
  clone.style.margin = '0'

  exportHost.appendChild(clone)
  document.body.appendChild(exportHost)

  try {
    await inlineCloneImages(clone)
    await waitForImages(clone)
    inlineComputedStyles(clone)

    const width = 390
    const height = Math.ceil(clone.getBoundingClientRect().height)
    const serialized = new XMLSerializer().serializeToString(clone)
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div>
        </foreignObject>
      </svg>
    `

    const svgUrl = URL.createObjectURL(
      new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    )
    const image = new Image()

    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = svgUrl
    })

    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale

    const context = canvas.getContext('2d')
    context.scale(scale, scale)
    context.drawImage(image, 0, 0, width, height)
    URL.revokeObjectURL(svgUrl)

    return await new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('图片生成失败。'))
      }, 'image/png')
    })
  } finally {
    exportHost.remove()
  }
}

const ComicReadingStats = ({ comicCatalog = [] }) => {
  const { user, loading, initializationError, readingRecords } = useComicAuth()
  const exportRef = useRef(null)
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
  const [heatmapYear, setHeatmapYear] = useState(() =>
    new Date().getFullYear()
  )

  const normalizedCatalog = useMemo(
    () =>
      comicCatalog.map(item => ({
        ...item,
        comicId: normalizeComicId(item.comicId)
      })),
    [comicCatalog]
  )

  const catalogById = useMemo(() => {
    const map = new Map()
    normalizedCatalog.forEach(item => map.set(item.comicId, item))
    return map
  }, [normalizedCatalog])

  const records = useMemo(
    () =>
      Object.entries(readingRecords || {}).map(([comicId, record]) => ({
        ...record,
        comic_id: normalizeComicId(record?.comic_id || comicId)
      })),
    [readingRecords]
  )

  const finishedRecords = useMemo(
    () => records.filter(record => record.status === 'finished'),
    [records]
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
    [records]
  )

  const completedByDate = useMemo(() => {
    const map = new Map()

    finishedRecords.forEach(record => {
      const dateKey = getLocalDateKey(record.finished_at)
      if (!dateKey) return

      const comic = catalogById.get(record.comic_id) || {
        comicId: record.comic_id,
        title: '已读完漫画',
        cover: null,
        proxyCover: null
      }

      const list = map.get(dateKey) || []
      list.push(comic)
      map.set(dateKey, list)
    })

    return map
  }, [catalogById, finishedRecords])

  const activityByDate = useMemo(() => {
    const map = new Map()

    records.forEach(record => {
      const recordDays = new Set(
        [
          getLocalDateKey(record.started_at),
          getLocalDateKey(record.finished_at)
        ].filter(Boolean)
      )

      recordDays.forEach(dateKey => {
        map.set(dateKey, (map.get(dateKey) || 0) + 1)
      })
    })

    return map
  }, [records])

  const heatmapDays = useMemo(() => getHeatmapDays(heatmapYear), [heatmapYear])
  const heatmapMonths = useMemo(
    () => getHeatmapMonthLabels(heatmapYear, heatmapDays),
    [heatmapDays, heatmapYear]
  )
  const heatmapWeekCount = Math.ceil(heatmapDays.length / 7)

  const calendarDays = useMemo(
    () => getCalendarDays(visibleMonth),
    [visibleMonth]
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
      .flatMap(record => [record.started_at, record.finished_at])
      .filter(Boolean)
      .map(value => new Date(value))
      .filter(date => !Number.isNaN(date.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())

    const latestActivity = activityDates[0]
    if (latestActivity) {
      setHeatmapYear(latestActivity.getFullYear())
    }

    const latestFinished = finishedRecords
      .map(record => new Date(record.finished_at))
      .filter(date => !Number.isNaN(date.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())[0]

    if (latestFinished) {
      setVisibleMonth(
        new Date(latestFinished.getFullYear(), latestFinished.getMonth(), 1)
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

  const handleAvatarChange = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !user) return

    try {
      const resizedAvatar = await resizeAvatarFile(file)
      setLocalAvatar(resizedAvatar)
      setAvatarFailed(false)
      window.localStorage.setItem(
        `comic-stats-avatar:${user.id}`,
        resizedAvatar
      )
    } catch (error) {
      window.alert(error?.message || '头像更换失败。')
    }
  }

  const handleExport = async () => {
    if (!exportRef.current || isExporting) return

    setIsExporting(true)

    try {
      const blob = await exportNodeToPng(exportRef.current)
      const fileName = `timdrake-reading-${getLocalDateKey(new Date())}.png`
      const file = new File([blob], fileName, { type: 'image/png' })

      if (
        navigator.share &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: '阅读统计' })
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[reading-stats] export failed:', error)
      window.alert('统计图生成失败，请刷新页面后重试。')
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
        <Link href='/comics/reading-list'>返回阅读清单</Link>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <section ref={exportRef} className={styles.card}>
        <span className={styles.topCorner} aria-hidden='true' />
        <span className={styles.watermark} aria-hidden='true'>
          TIMDRAKE
        </span>

        <header className={styles.profileHeader}>
          <div className={styles.identity}>
            {isEditingName ? (
              <input
                ref={nameInputRef}
                className={styles.nameInput}
                value={draftName}
                maxLength={50}
                aria-label='编辑展示名称'
                onChange={event => setDraftName(event.target.value)}
                onBlur={saveDisplayName}
                onKeyDown={event => {
                  if (event.key === 'Enter') saveDisplayName()
                  if (event.key === 'Escape') {
                    setDraftName(displayName)
                    setIsEditingName(false)
                  }
                }}
              />
            ) : (
              <button
                type='button'
                className={styles.displayName}
                title={user.email}
                onClick={() => setIsEditingName(true)}
              >
                {displayName || user.email}
              </button>
            )}
          </div>

          <label className={styles.avatarControl} title='点击更换展示头像'>
            <input
              className={styles.avatarInput}
              type='file'
              accept='image/*'
              onChange={handleAvatarChange}
            />

            {avatarUrl && !avatarFailed ? (
              <img
                className={styles.avatar}
                src={avatarUrl}
                alt='用户头像'
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <span className={styles.avatarFallback}>
                {getEmailInitial(user.email)}
              </span>
            )}

            <span className={styles.avatarEditIcon} aria-hidden='true'>
              <IconPhotoEdit size={15} stroke={1.7} />
            </span>
          </label>
        </header>

        <section className={styles.overview} aria-label='阅读完成进度'>
          <div className={styles.ringWrap}>
            <svg className={styles.ring} viewBox='0 0 120 120' aria-hidden='true'>
              <circle className={styles.ringTrack} cx='60' cy='60' r='48' />
              <circle
                className={styles.ringProgress}
                cx='60'
                cy='60'
                r='48'
                pathLength='100'
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

        <section className={styles.heatmapSection} aria-label='年度阅读活动'>
          <header className={styles.heatmapHeader}>
            <div>
              <span className={styles.sectionKicker}>READING ACTIVITY</span>
              <h2>阅读热力图</h2>
            </div>

            <div className={styles.heatmapYearActions}>
              <button
                type='button'
                className={styles.heatmapYearButton}
                aria-label='上一年'
                onClick={() => setHeatmapYear(current => current - 1)}
              >
                <IconChevronLeft size={18} stroke={1.8} />
              </button>
              <strong>{heatmapYear}</strong>
              <button
                type='button'
                className={styles.heatmapYearButton}
                aria-label='下一年'
                onClick={() => setHeatmapYear(current => current + 1)}
              >
                <IconChevronRight size={18} stroke={1.8} />
              </button>
            </div>
          </header>

          <div className={styles.heatmapViewport}>
            <div className={styles.heatmapBody}>
              <div className={styles.heatmapWeekdays} aria-hidden='true'>
                {HEATMAP_WEEKDAYS.map((weekday, index) => (
                  <span key={`${weekday}-${index}`}>{weekday}</span>
                ))}
              </div>

              <div className={styles.heatmapContent}>
                <div
                  className={styles.heatmapMonths}
                  style={{
                    gridTemplateColumns: `repeat(${heatmapWeekCount}, 12px)`
                  }}
                  aria-hidden='true'
                >
                  {heatmapMonths.map(month => (
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
                    gridTemplateColumns: `repeat(${heatmapWeekCount}, 12px)`
                  }}
                >
                  {heatmapDays.map(day => {
                    const count = activityByDate.get(day.key) || 0
                    const level = getHeatmapLevel(count)

                    return (
                      <span
                        key={day.key}
                        className={[
                          styles.heatmapCell,
                          styles[`heatmapLevel${level}`],
                          !day.inCurrentYear ? styles.heatmapOutsideYear : ''
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
                type='button'
                className={styles.monthButton}
                aria-label='上个月'
                onClick={() =>
                  setVisibleMonth(
                    current =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() - 1,
                        1
                      )
                  )
                }
              >
                <IconChevronLeft size={20} stroke={1.8} />
              </button>

              <h2>{formatMonthTitle(visibleMonth)}</h2>

              <button
                type='button'
                className={styles.monthButton}
                aria-label='下个月'
                onClick={() =>
                  setVisibleMonth(
                    current =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() + 1,
                        1
                      )
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
            {WEEKDAYS.map(weekday => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className={styles.calendarGrid}>
            {calendarDays.map(day => {
              const completedComics = completedByDate.get(day.key) || []
              const featuredComic =
                completedComics.find(comic => comic.cover) || completedComics[0]
              const hasCover = Boolean(featuredComic?.cover)

              return (
                <div
                  key={day.key}
                  className={[
                    styles.calendarCell,
                    !day.inCurrentMonth ? styles.outsideMonth : '',
                    hasCover ? styles.coverCell : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={completedComics.map(comic => comic.title).join('、')}
                >
                  <span className={styles.dayNumber}>
                    {day.date.getDate()}
                  </span>

                  {hasCover && (
                    <img
                      className={styles.calendarCover}
                      src={featuredComic.cover}
                      data-fallback={featuredComic.proxyCover || ''}
                      alt={featuredComic.title}
                      loading='lazy'
                      onError={event => {
                        const image = event.currentTarget
                        const fallback = image.dataset.fallback

                        if (fallback) {
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
      </section>

      <button
        type='button'
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
