import {
  useState
} from 'react'

import {
  useComicAuth
} from './ComicAuthContext'

import styles from './ComicAuthPanel.module.css'

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

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [submitting,
    setSubmitting] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const [errorMessage,
    setErrorMessage] =
    useState('')

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
          setMessage(
            '登录成功。'
          )

          setPassword('')
          return
        }

        if (result.data?.session) {
          setMessage(
            '注册成功，已自动登录。'
          )
        } else {
          setMessage(
            '注册邮件已发送，请打开邮箱完成确认。'
          )
        }

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

          return
        }

        setMessage(
          '已经退出登录。'
        )
      } finally {
        setSubmitting(false)
      }
    }

  if (loading) {
    return (
      <section
        className={styles.panel}>
        <p className={styles.hint}>
          正在检查登录状态……
        </p>
      </section>
    )
  }

  if (initializationError) {
    return (
      <section
        className={styles.panel}>
        <p className={styles.error}>
          {initializationError}
        </p>
      </section>
    )
  }

  if (user) {
    return (
      <section
        className={styles.panel}>
        <div
          className={
            styles.loggedInRow
          }>
          <div>
            <p
              className={
                styles.loggedInTitle
              }>
              已登录
            </p>

            <p
              className={
                styles.email
              }>
              {user.email}
            </p>
          </div>

          <button
            type='button'
            className={
              styles.secondaryButton
            }
            disabled={submitting}
            onClick={
              handleSignOut
            }>
            退出
          </button>
        </div>

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
    )
  }

  return (
    <section
      className={styles.panel}>
      <div
        className={styles.tabs}>
        <button
          type='button'
          className={
            mode === 'login'
              ? styles.activeTab
              : styles.tab
          }
          onClick={() => {
            setMode('login')
            setMessage('')
            setErrorMessage('')
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
            setMode('register')
            setMessage('')
            setErrorMessage('')
          }}>
          注册
        </button>
      </div>

      <form
        className={styles.form}
        onSubmit={
          handleSubmit
        }>
        <label
          className={styles.field}>
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
          className={styles.field}>
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
  )
}

export default ComicAuthPanel
