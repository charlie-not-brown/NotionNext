import {
  useEffect,
  useMemo,
  useState
} from 'react'

import {
  useComicAuth
} from './ComicAuthContext'

import styles from './ComicAuthPanel.module.css'

const getEmailInitial = email => {
  const normalizedEmail =
    typeof email === 'string'
      ? email.trim()
      : ''

  return normalizedEmail
    .charAt(0)
    .toUpperCase() || '?'
}

const ComicAuthPanel = () => {
  const {
    user,
    loading,
    initializationError,
    signIn,
    signUp,
    signOut
  } = useComicAuth()

  const [mode, setMode] =
    useState('login')

  const [isOpen, setIsOpen] =
    useState(false)

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [
    submitting,
    setSubmitting
  ] = useState(false)

  const [message, setMessage] =
    useState('')

  const [
    errorMessage,
    setErrorMessage
  ] = useState('')

  const [
    avatarFailed,
    setAvatarFailed
  ] = useState(false)

  /*
   * Supabase OAuth 登录通常会提供
   * avatar_url 或 picture。
   *
   * 普通邮箱密码注册一般没有头像，
   * 此时显示邮箱首字母头像。
   */
  const avatarUrl = useMemo(() => {
    return (
      user?.user_metadata
        ?.avatar_url ||
      user?.user_metadata
        ?.picture ||
      ''
    )
  }, [user])

  useEffect(() => {
    setAvatarFailed(false)
  }, [avatarUrl])

  /*
   * 登录成功后自动关闭弹窗。
   */
  useEffect(() => {
    if (user) {
      setIsOpen(false)
    }
  }, [user])

  /*
   * 登录弹窗打开后：
   * 1. 禁止底层页面滚动
   * 2. 支持按 Esc 关闭
   */
  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const previousOverflow =
      document.body.style.overflow

    document.body.style.overflow =
      'hidden'

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener(
      'keydown',
      handleKeyDown
    )

    return () => {
      document.body.style.overflow =
        previousOverflow

      window.removeEventListener(
        'keydown',
        handleKeyDown
      )
    }
  }, [isOpen])

  const openLoginPanel = () => {
    setMessage('')
    setErrorMessage('')
    setIsOpen(true)
  }

  const closeLoginPanel = () => {
    if (submitting) {
      return
    }

    setIsOpen(false)
    setMessage('')
    setErrorMessage('')
    setPassword('')
  }

  const changeMode = nextMode => {
    setMode(nextMode)
    setMessage('')
    setErrorMessage('')
    setPassword('')
  }

  const handleSubmit =
    async event => {
      event.preventDefault()

      setMessage('')
      setErrorMessage('')
      setSubmitting(true)

      try {
        const result =
          mode === 'login'
            ? await signIn({
                email:
                  email.trim(),
                password
              })
            : await signUp({
                email:
                  email.trim(),
                password
              })

        if (result.error) {
          setErrorMessage(
            result.error.message
          )

          return
        }

        if (mode === 'login') {
          setPassword('')
          setIsOpen(false)

          return
        }

        if (result.data?.session) {
          setPassword('')
          setIsOpen(false)

          return
        }

        setMessage(
          '注册邮件已发送，请打开邮箱完成确认。'
        )

        setPassword('')
      } finally {
        setSubmitting(false)
      }
    }

  const handleSignOut =
    async () => {
      setMessage('')
      setErrorMessage('')
      setSubmitting(true)

      try {
        const {
          error
        } = await signOut()

        if (error) {
          setErrorMessage(
            error.message
          )
        }
      } finally {
        setSubmitting(false)
      }
    }

  if (loading) {
    return (
      <div
        className={
          styles.authContainer
        }>
        <p
          className={
            styles.compactHint
          }>
          正在检查登录状态……
        </p>
      </div>
    )
  }

  if (initializationError) {
    return (
      <div
        className={
          styles.authContainer
        }>
        <p
          className={
            styles.compactError
          }>
          {initializationError}
        </p>
      </div>
    )
  }

  if (user) {
    const emailInitial =
      getEmailInitial(user.email)

    return (
      <div
        className={
          styles.authContainer
        }>
        <div
          className={
            styles.userBar
          }>
          {avatarUrl &&
          !avatarFailed ? (
            <img
              className={
                styles.userAvatar
              }
              src={avatarUrl}
              alt=''
              referrerPolicy='no-referrer'
              onError={() => {
                setAvatarFailed(true)
              }}
            />
          ) : (
            <span
              className={
                styles.userAvatarFallback
              }
              aria-hidden='true'>
              {emailInitial}
            </span>
          )}

          <span
            className={
              styles.userEmail
            }
            title={user.email}>
            {user.email}
          </span>

          <button
            type='button'
            className={
              styles.signOutButton
            }
            disabled={submitting}
            onClick={
              handleSignOut
            }>
            {submitting
              ? '退出中……'
              : '退出'}
          </button>
        </div>

        {errorMessage && (
          <p
            className={
              styles.compactError
            }>
            {errorMessage}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      className={
        styles.authContainer
      }>
      <button
        type='button'
        className={
          styles.loginTrigger
        }
        onClick={
          openLoginPanel
        }>
        登录
      </button>

      {isOpen && (
        <div
          className={
            styles.modalOverlay
          }
          onMouseDown={event => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeLoginPanel()
            }
          }}>
          <section
            className={
              `${styles.panel} ${styles.modalPanel}`
            }
            role='dialog'
            aria-modal='true'
            aria-label='用户登录'>
            <button
              type='button'
              className={
                styles.closeButton
              }
              aria-label='关闭登录面板'
              disabled={submitting}
              onClick={
                closeLoginPanel
              }>
              ×
            </button>

            <div
              className={
                styles.tabs
              }>
              <button
                type='button'
                className={
                  mode === 'login'
                    ? styles.activeTab
                    : styles.tab
                }
                onClick={() => {
                  changeMode(
                    'login'
                  )
                }}>
                登录
              </button>

              <button
                type='button'
                className={
                  mode === 'register'
                    ? styles.activeTab
                    : styles.tab
                }
                onClick={() => {
                  changeMode(
                    'register'
                  )
                }}>
                注册
              </button>
            </div>

            <form
              className={
                styles.form
              }
              onSubmit={
                handleSubmit
              }>
              <label
                className={
                  styles.field
                }>
                <span>邮箱</span>

                <input
                  type='email'
                  value={email}
                  autoComplete='email'
                  required
                  autoFocus
                  onChange={event => {
                    setEmail(
                      event.target.value
                    )
                  }}
                />
              </label>

              <label
                className={
                  styles.field
                }>
                <span>密码</span>

                <input
                  type='password'
                  value={password}
                  autoComplete={
                    mode === 'login'
                      ? 'current-password'
                      : 'new-password'
                  }
                  minLength={6}
                  required
                  onChange={event => {
                    setPassword(
                      event.target.value
                    )
                  }}
                />
              </label>

              <button
                type='submit'
                className={
                  styles.primaryButton
                }
                disabled={submitting}>
                {submitting
                  ? '请稍候……'
                  : mode === 'login'
                    ? '登录'
                    : '创建账号'}
              </button>
            </form>

            {message && (
              <p
                className={
                  styles.success
                }>
                {message}
              </p>
            )}

            {errorMessage && (
              <p
                className={
                  styles.error
                }>
                {errorMessage}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default ComicAuthPanel