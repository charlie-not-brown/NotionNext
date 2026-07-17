import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'

const ComicAuthContext =
  createContext(null)

const VALID_READING_STATUSES =
  new Set([
    'want',
    'reading',
    'finished'
  ])

export const ComicAuthProvider = ({
  children
}) => {
  const [supabase, setSupabase] =
    useState(null)

  const [session, setSession] =
    useState(null)

  const [loading, setLoading] =
    useState(true)

  const [
    initializationError,
    setInitializationError
  ] = useState('')

  const [
    readingStatuses,
    setReadingStatuses
  ] = useState({})

  const [
    readingStatusesLoading,
    setReadingStatusesLoading
  ] = useState(false)

  useEffect(() => {
    let mounted = true
    let subscription = null

    const initializeAuth = async () => {
      try {
        const {
          getSupabaseClient
        } = await import(
          '@/lib/supabase/client'
        )

        if (!mounted) {
          return
        }

        const client =
          getSupabaseClient()

        if (!client) {
          setInitializationError(
            'Supabase 客户端初始化失败，请检查环境变量。'
          )

          setLoading(false)
          return
        }

        setSupabase(client)

        const {
          data: authListener
        } = client.auth
          .onAuthStateChange(
            (
              _event,
              nextSession
            ) => {
              if (!mounted) {
                return
              }

              setSession(
                nextSession
              )
            }
          )

        subscription =
          authListener.subscription

        const {
          data,
          error
        } = await client.auth
          .getSession()

        if (!mounted) {
          return
        }

        if (error) {
          setInitializationError(
            error.message
          )
        }

        setSession(
          data?.session || null
        )
      } catch (error) {
        if (!mounted) {
          return
        }

        setInitializationError(
          error?.message ||
            '登录系统加载失败。'
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

  /**
   * 登录用户变化时，
   * 从 Supabase 读取全部阅读状态。
   */
  useEffect(() => {
    const userId =
      session?.user?.id

    if (
      !supabase ||
      !userId
    ) {
      setReadingStatuses({})
      setReadingStatusesLoading(
        false
      )

      return
    }

    let cancelled = false

    const loadReadingStatuses =
      async () => {
        setReadingStatusesLoading(
          true
        )

        const {
          data,
          error
        } = await supabase
          .from('reading_status')
          .select(
            'comic_id, status'
          )
          .eq(
            'user_id',
            userId
          )

        if (cancelled) {
          return
        }

        if (error) {
          console.error(
            '[ComicAuthContext] 读取阅读状态失败',
            error
          )

          setReadingStatuses({})
          setReadingStatusesLoading(
            false
          )

          return
        }

        const nextStatuses = {}

        ;(data || []).forEach(
          record => {
            if (
              record?.comic_id &&
              VALID_READING_STATUSES
                .has(record.status)
            ) {
              nextStatuses[
                record.comic_id
              ] = record.status
            }
          }
        )

        setReadingStatuses(
          nextStatuses
        )

        setReadingStatusesLoading(
          false
        )
      }

    loadReadingStatuses()

    return () => {
      cancelled = true
    }
  }, [
    supabase,
    session?.user?.id
  ])

  /**
   * 保存或清除某本漫画的阅读状态。
   */
  const saveReadingStatus =
    useCallback(
      async (
        comicId,
        status
      ) => {
        const userId =
          session?.user?.id

        if (
          !supabase ||
          !userId
        ) {
          return {
            error: new Error(
              '请先登录。'
            )
          }
        }

        const normalizedComicId =
          String(comicId || '')
            .replace(/-/g, '')
            .toLowerCase()

        if (
          !/^[a-f0-9]{32}$/.test(
            normalizedComicId
          )
        ) {
          return {
            error: new Error(
              '无法读取这条漫画记录的 Notion ID。'
            )
          }
        }

        let error = null

        if (
          VALID_READING_STATUSES
            .has(status)
        ) {
          const result =
            await supabase
              .from(
                'reading_status'
              )
              .upsert(
                {
                  user_id: userId,
                  comic_id:
                    normalizedComicId,
                  status,
                  updated_at:
                    new Date()
                      .toISOString()
                },
                {
                  onConflict:
                    'user_id,comic_id'
                }
              )

          error = result.error
        } else {
          const result =
            await supabase
              .from(
                'reading_status'
              )
              .delete()
              .eq(
                'user_id',
                userId
              )
              .eq(
                'comic_id',
                normalizedComicId
              )

          error = result.error
        }

        if (error) {
          console.error(
            '[ComicAuthContext] 保存阅读状态失败',
            error
          )

          return { error }
        }

        setReadingStatuses(
          currentStatuses => {
            const nextStatuses = {
              ...currentStatuses
            }

            if (
              VALID_READING_STATUSES
                .has(status)
            ) {
              nextStatuses[
                normalizedComicId
              ] = status
            } else {
              delete nextStatuses[
                normalizedComicId
              ]
            }

            return nextStatuses
          }
        )

        return {
          error: null
        }
      },
      [
        supabase,
        session?.user?.id
      ]
    )

  const signIn = useCallback(
    async ({
      email,
      password
    }) => {
      if (!supabase) {
        return {
          data: null,
          error: new Error(
            '登录系统尚未准备完成。'
          )
        }
      }

      return supabase.auth
        .signInWithPassword({
          email,
          password
        })
    },
    [supabase]
  )

  const signUp = useCallback(
    async ({
      email,
      password
    }) => {
      if (!supabase) {
        return {
          data: null,
          error: new Error(
            '登录系统尚未准备完成。'
          )
        }
      }

      const emailRedirectTo =
        typeof window ===
        'undefined'
          ? undefined
          : `${window.location.origin}${window.location.pathname}`

      return supabase.auth
        .signUp({
          email,
          password,
          options: {
            emailRedirectTo
          }
        })
    },
    [supabase]
  )

  const signOut = useCallback(
    async () => {
      if (!supabase) {
        return {
          error: new Error(
            '登录系统尚未准备完成。'
          )
        }
      }

      return supabase.auth
        .signOut()
    },
    [supabase]
  )

  const value = useMemo(
    () => ({
      supabase,
      session,
      user:
        session?.user || null,
      loading,
      initializationError,
      readingStatuses,
      readingStatusesLoading,
      saveReadingStatus,
      signIn,
      signUp,
      signOut
    }),
    [
      supabase,
      session,
      loading,
      initializationError,
      readingStatuses,
      readingStatusesLoading,
      saveReadingStatus,
      signIn,
      signUp,
      signOut
    ]
  )

  return (
    <ComicAuthContext.Provider
      value={value}>
      {children}
    </ComicAuthContext.Provider>
  )
}

export const useComicAuth = () => {
  const context = useContext(
    ComicAuthContext
  )

  if (!context) {
    throw new Error(
      'useComicAuth 必须在 ComicAuthProvider 内使用。'
    )
  }

  return context
}