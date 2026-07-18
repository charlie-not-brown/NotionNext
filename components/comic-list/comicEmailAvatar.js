const getUserAvatarUrl = currentUser => {
  const providerAvatar =
    currentUser?.user_metadata
      ?.avatar_url ||
    currentUser?.user_metadata
      ?.picture ||
    ''

  if (providerAvatar) {
    return providerAvatar
  }

  const normalizedEmail =
    String(
      currentUser?.email || ''
    )
      .trim()
      .toLowerCase()

  const [
    emailName,
    emailDomain
  ] = normalizedEmail.split('@')

  /*
   * QQ 邮箱可以根据数字 QQ 号读取头像。
   */
  if (
    emailDomain === 'qq.com' &&
    /^\d+$/.test(emailName)
  ) {
    return (
      'https://q1.qlogo.cn/g' +
      `?b=qq&nk=${emailName}&s=100`
    )
  }

  return ''
}

const avatarUrl =
  getUserAvatarUrl(user)