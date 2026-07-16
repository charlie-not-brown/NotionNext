import {
  createClient
} from '@supabase/supabase-js'

let supabaseClient = null

/**
 * 获取浏览器端 Supabase 客户端。
 *
 * 只在浏览器中创建一次，
 * 后续登录、退出和阅读状态
 * 共用同一个客户端实例。
 */
export const getSupabaseClient = () => {
  if (typeof window === 'undefined') {
    return null
  }

  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL

  const supabasePublishableKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (
    !supabaseUrl ||
    !supabasePublishableKey
  ) {
    console.error(
      '[Supabase] 缺少环境变量'
    )

    return null
  }

  supabaseClient = createClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  )

  return supabaseClient
}