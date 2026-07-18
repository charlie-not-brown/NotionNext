import {
  md5
} from 'js-md5'

export const getComicEmailAvatar =
  email => {
    const normalizedEmail =
      String(email || '')
        .trim()
        .toLowerCase()

    if (!normalizedEmail) {
      return ''
    }

    const [
      emailName,
      emailDomain
    ] = normalizedEmail.split('@')

    /*
     * 数字 QQ 邮箱优先读取 QQ 头像。
     */
    if (
      emailDomain === 'qq.com' &&
      /^\d+$/.test(emailName)
    ) {
      return (
        'https://q1.qlogo.cn/g' +
        `?b=qq&nk=${emailName}` +
        '&s=100'
      )
    }

    /*
     * 其他邮箱使用邮箱 MD5
     * 查询 Cravatar。
     *
     * d=404 表示没有对应头像时
     * 返回加载失败，让登录面板
     * 自动显示邮箱首字母。
     */
    const emailHash =
      md5(normalizedEmail)

    return (
      'https://cravatar.cn/avatar/' +
      `${emailHash}?s=96&d=404`
    )
  }