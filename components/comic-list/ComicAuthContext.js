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

export const ComicAuthProvider = ({
  children
}) => {
  const [supabase, setSupabase] =
    useState(null)

  const [session, setSession] =
    useState(null)

  const [loading, setLoading] =
    useState(true)

  const [initializationError,
    setInitializationError] =
    useState('')

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

        /*
         * 监听登录、退出和会话刷新。
         *
         * 回调中只更新 React 状态，
         * 不执行额外异步 Supabase 请求。
         */
        const {
          data: authListener
        } =
          client.auth
            .onAuthStateChange(
              (_event, nextSession) => {
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
        } =
          await client.auth
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

  const signOut = useCallback(
    async () => {
      if (!supabase) {
        return {
          error: new Error(
            '登录系统尚未准备完成。'
          )
        }
      }

      return supabase.auth.signOut()
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
      signIn,
      signUp,
      signOut
    }),
    [
      supabase,
      session,
      loading,
      initializationError,
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
  const context =
    useContext(
      ComicAuthContext
    )

  if (!context) {
    throw new Error(
      'useComicAuth 必须在 ComicAuthProvider 内使用。'
    )
  }

  return context
}
