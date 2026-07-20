import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'

const ComicAuthContext = createContext(null)

const VALID_READING_STATUSES = new Set([
  'want',
  'reading',
  'finished'
])

const normalizeComicId = comicId => {
  return String(comicId || '')
    .replace(/-/g, '')
    .toLowerCase()
}

const normalizeRating = rating => {
  if (rating === null || rating === undefined || rating === '') {
    return null
  }

  const number = Number(rating)

  if (!Number.isInteger(number) || number < 1 || number > 5) {
    return null
  }

  return number
}

const normalizeDateTime = value => {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString()
}

const normalizeRecord = record => {
  const comicId = normalizeComicId(record?.comic_id)

  if (!/^[a-f0-9]{32}$/.test(comicId)) {
    return null
  }

  return {
    comic_id: comicId,
    status: VALID_READING_STATUSES.has(record?.status)
      ? record.status
      : null,
    rating: normalizeRating(record?.rating),
    started_at: normalizeDateTime(record?.started_at),
    finished_at: normalizeDateTime(record?.finished_at)
  }
}

const isEmptyRecord = record => {
  return (
    !record?.status &&
    !record?.rating &&
    !record?.started_at &&
    !record?.finished_at
  )
}

export const ComicAuthProvider = ({ children }) => {
  const [supabase, setSupabase] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initializationError, setInitializationError] = useState('')
  const [readingRecords, setReadingRecords] = useState({})
  const [readingStatusesLoading, setReadingStatusesLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    let subscription = null

    const initializeAuth = async () => {
      try {
        const { getSupabaseClient } = await import('@/lib/supabase/client')

        if (!mounted) {
          return
        }

        const client = getSupabaseClient()

        if (!client) {
          setInitializationError(
            'Supabase 客户端初始化失败，请检查环境变量。'
          )
          setLoading(false)
          return
        }

        setSupabase(client)

        const { data: authListener } = client.auth.onAuthStateChange(
          (_event, nextSession) => {
            if (!mounted) {
              return
            }

            setSession(nextSession)
          }
        )

        subscription = authListener.subscription

        const { data, error } = await client.auth.getSession()

        if (!mounted) {
          return
        }

        if (error) {
          setInitializationError(error.message)
        }

        setSession(data?.session || null)
      } catch (error) {
        if (!mounted) {
          return
        }

        setInitializationError(
          error?.message || '登录系统加载失败。'
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initializeAuth()

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const userId = session?.user?.id

    if (!supabase || !userId) {
      setReadingRecords({})
      setReadingStatusesLoading(false)
      return
    }

    let cancelled = false

    const loadReadingRecords = async () => {
      setReadingStatusesLoading(true)

      const { data, error } = await supabase
        .from('reading_status')
        .select('comic_id, status, rating, started_at, finished_at')
        .eq('user_id', userId)

      if (cancelled) {
        return
      }

      if (error) {
        console.error(
          '[ComicAuthContext] 读取漫画记录失败',
          error
        )
        setReadingRecords({})
        setReadingStatusesLoading(false)
        return
      }

      const nextRecords = {}

      ;(data || []).forEach(record => {
        const normalizedRecord = normalizeRecord(record)

        if (normalizedRecord) {
          nextRecords[normalizedRecord.comic_id] = normalizedRecord
        }
      })

      setReadingRecords(nextRecords)
      setReadingStatusesLoading(false)
    }

    loadReadingRecords()

    return () => {
      cancelled = true
    }
  }, [supabase, session?.user?.id])

  const readingStatuses = useMemo(() => {
    const nextStatuses = {}

    Object.entries(readingRecords).forEach(([comicId, record]) => {
      if (VALID_READING_STATUSES.has(record?.status)) {
        nextStatuses[comicId] = record.status
      }
    })

    return nextStatuses
  }, [readingRecords])

  const saveReadingRecord = useCallback(
    async (comicId, patch = {}) => {
      const userId = session?.user?.id

      if (!supabase || !userId) {
        return {
          data: null,
          error: new Error('请先登录。')
        }
      }

      const normalizedComicId = normalizeComicId(comicId)

      if (!/^[a-f0-9]{32}$/.test(normalizedComicId)) {
        return {
          data: null,
          error: new Error(
            '无法读取这条漫画记录的 Notion ID。'
          )
        }
      }

      const currentRecord = readingRecords[normalizedComicId] || {
        comic_id: normalizedComicId,
        status: null,
        rating: null,
        started_at: null,
        finished_at: null
      }

      const nextRecord = {
        ...currentRecord,
        comic_id: normalizedComicId
      }

      if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
        nextRecord.status = VALID_READING_STATUSES.has(patch.status)
          ? patch.status
          : null
      }

      if (Object.prototype.hasOwnProperty.call(patch, 'rating')) {
        nextRecord.rating = normalizeRating(patch.rating)
      }

      if (Object.prototype.hasOwnProperty.call(patch, 'started_at')) {
        nextRecord.started_at = normalizeDateTime(patch.started_at)
      }

      if (Object.prototype.hasOwnProperty.call(patch, 'finished_at')) {
        nextRecord.finished_at = normalizeDateTime(patch.finished_at)
      }

      let error = null

      if (isEmptyRecord(nextRecord)) {
        const result = await supabase
          .from('reading_status')
          .delete()
          .eq('user_id', userId)
          .eq('comic_id', normalizedComicId)

        error = result.error
      } else {
        const result = await supabase
          .from('reading_status')
          .upsert(
            {
              user_id: userId,
              comic_id: normalizedComicId,
              status: nextRecord.status,
              rating: nextRecord.rating,
              started_at: nextRecord.started_at,
              finished_at: nextRecord.finished_at,
              updated_at: new Date().toISOString()
            },
            {
              onConflict: 'user_id,comic_id'
            }
          )

        error = result.error
      }

      if (error) {
        console.error(
          '[ComicAuthContext] 保存漫画记录失败',
          error
        )

        return {
          data: null,
          error
        }
      }

      setReadingRecords(currentRecords => {
        const nextRecords = {
          ...currentRecords
        }

        if (isEmptyRecord(nextRecord)) {
          delete nextRecords[normalizedComicId]
        } else {
          nextRecords[normalizedComicId] = nextRecord
        }

        return nextRecords
      })

      return {
        data: isEmptyRecord(nextRecord) ? null : nextRecord,
        error: null
      }
    },
    [readingRecords, session?.user?.id, supabase]
  )

  /**
   * 自动时间规则：
   * - 第一次标记“在读”时，记录当时的完整时间。
   * - 第一次标记“读完”时，记录当时的完整时间。
   * - 已经有记录时不覆盖，避免误操作改掉历史时间。
   * - 改为“想读”或清除状态时，不自动删除历史时间。
   */
  const saveReadingStatus = useCallback(
    async (comicId, status) => {
      const normalizedComicId = normalizeComicId(comicId)
      const currentRecord = readingRecords[normalizedComicId]
      const patch = {
        status
      }
      const now = new Date().toISOString()

      if (status === 'reading' && !currentRecord?.started_at) {
        patch.started_at = now
      }

      if (status === 'finished' && !currentRecord?.finished_at) {
        patch.finished_at = now
      }

      return saveReadingRecord(normalizedComicId, patch)
    },
    [readingRecords, saveReadingRecord]
  )

  const saveRating = useCallback(
    async (comicId, rating) => {
      return saveReadingRecord(comicId, {
        rating
      })
    },
    [saveReadingRecord]
  )

  const saveReadingDates = useCallback(
    async (
      comicId,
      {
        startedAt = null,
        finishedAt = null
      } = {}
    ) => {
      return saveReadingRecord(comicId, {
        started_at: startedAt,
        finished_at: finishedAt
      })
    },
    [saveReadingRecord]
  )

  const signIn = useCallback(
    async ({ email, password }) => {
      if (!supabase) {
        return {
          data: null,
          error: new Error('登录系统尚未准备完成。')
        }
      }

      return supabase.auth.signInWithPassword({
        email,
        password
      })
    },
    [supabase]
  )

  const signUp = useCallback(
    async ({ email, password }) => {
      if (!supabase) {
        return {
          data: null,
          error: new Error('登录系统尚未准备完成。')
        }
      }

      const emailRedirectTo =
        typeof window === 'undefined'
          ? undefined
          : `${window.location.origin}${window.location.pathname}`

      return supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo
        }
      })
    },
    [supabase]
  )

  const signOut = useCallback(async () => {
    if (!supabase) {
      return {
        error: new Error('登录系统尚未准备完成。')
      }
    }

    return supabase.auth.signOut()
  }, [supabase])

  const value = useMemo(
    () => ({
      supabase,
      session,
      user: session?.user || null,
      loading,
      initializationError,
      readingRecords,
      readingStatuses,
      readingStatusesLoading,
      saveReadingRecord,
      saveReadingStatus,
      saveRating,
      saveReadingDates,
      signIn,
      signUp,
      signOut
    }),
    [
      supabase,
      session,
      loading,
      initializationError,
      readingRecords,
      readingStatuses,
      readingStatusesLoading,
      saveReadingRecord,
      saveReadingStatus,
      saveRating,
      saveReadingDates,
      signIn,
      signUp,
      signOut
    ]
  )

  return (
    <ComicAuthContext.Provider value={value}>
      {children}
    </ComicAuthContext.Provider>
  )
}

export const useComicAuth = () => {
  const context = useContext(ComicAuthContext)

  if (!context) {
    throw new Error(
      'useComicAuth 必须在 ComicAuthProvider 内使用。'
    )
  }

  return context
}
