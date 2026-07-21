import Link from 'next/link'

import {
  useEffect,
  useState
} from 'react'

import {
  useComicAuth
} from './ComicAuthContext'

import {
  getComicEmailAvatar
} from './comicEmailAvatar'

import styles from './ComicAuthPanel.module.css'

const getEmailInitial = email => {
  const normalizedEmail =
    typeof email === 'string'
      ? email.trim()
      : ''

  return (
    normalizedEmail
      .charAt(0)
      .toUpperCase() || '?'
  )
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

  const [
    isPanelOpen,
    setIsPanelOpen
  ] = useState(false)

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
   * 头像读取顺序：
   *
   * 1. Supabase 登录提供的头像
   * 2. 根据邮箱获取 QQ / Cravatar 头像
   * 3. 图片获取失败后显示邮箱首字母
   */
  const avatarUrl =
    user?.user_metadata
      ?.avatar_url ||
    user?.user_metadata
      ?.picture ||
    getComicEmailAvatar(
      user?.email
    )

  useEffect(() => {
    setAvatarFailed(false)
  }, [
    avatarUrl,
    user?.id
  ])

  /*
   * 登录成功后自动关闭登录表单。
   */
  useEffect(() => {
    if (user) {
      setIsPanelOpen(false)
    }
  }, [user])

  const toggleLoginPanel = () => {
    setMessage('')
    setErrorMessage('')

    setIsPanelOpen(
      currentValue =>
        !currentValue
    )
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
          setIsPanelOpen(false)

          return
        }

        if (result.data?.session) {
          setPassword('')
          setIsPanelOpen(false)

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
      getEmailInitial(
        user.email
      )

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
            }>
            {user.email}
          </span>

          <Link
            href='/comics/reading-stats'
            className={styles.userAction}
          >
            统计
          </Link>

          <button
            type='button'
            className={
              styles.userAction
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
        aria-expanded={
          isPanelOpen
        }
        aria-controls='comic-login-panel'
        onClick={
          toggleLoginPanel
        }>
        登录
      </button>

      {isPanelOpen && (
        <section
          id='comic-login-panel'
          className={
            `${styles.panel} ${styles.inlinePanel}`
          }>
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
      )}
    </div>
  )
}

export default ComicAuthPanel