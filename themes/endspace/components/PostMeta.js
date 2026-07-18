import {
  IconClock,
  IconRefresh,
  IconFolder,
  IconFileText,
  IconUser
} from '@tabler/icons-react'

/**
 * PostMeta Component - Minimalist Light Industrial
 * Minimalist/futuristic metadata display
 * No redundant labels ("DATE:", etc.), just pure data and icons.
 * Tabler Icons for Futuristic Feel
 */
export const PostMeta = ({ post }) => {
  if (!post) return null

  /**
   * 读取 Notion 数据库中的 repostAuthor 文本属性。
   * 没填写时为空字符串，作者栏不会渲染。
   */
  const repostAuthor =
    typeof post.repostAuthor === 'string'
      ? post.repostAuthor.trim()
      : ''

  return (
    <div className='mb-10 w-full'>
      {/* Header Block */}
      <div className='relative mb-6'>
        {/* Top Identification Line */}
        <div className='mb-6 flex items-center gap-3 border-b border-[var(--endspace-border-base)] pb-2 font-mono text-xs text-[var(--endspace-text-muted)]'>
          <span className='font-bold text-[var(--endspace-text-primary)]'>
            DOC_ID // {post.id?.slice(0, 6) || 'UNKNOWN'}
          </span>

          <span className='flex-1' />

          <span className='flex items-center gap-2'>
            <span className='h-2 w-2 animate-pulse rounded-full bg-green-500' />
            ONLINE
          </span>
        </div>

        <h1 className='mb-6 text-4xl font-black leading-tight tracking-tight text-[var(--endspace-text-primary)] md:text-6xl'>
          {post.title}
        </h1>

        {/* Data Grid - Borderless, clean negative space */}
        <div className='flex flex-wrap items-center gap-x-8 gap-y-4 font-mono text-sm text-[var(--endspace-text-secondary)]'>
          {/* Date */}
          <div className='flex items-center gap-2'>
            <IconClock
              size={14}
              stroke={1.5}
              className='text-[var(--endspace-text-muted)]'
            />
            <span>{post.publishDay}</span>
          </div>

          {/* Author：只有填写 repostAuthor 时才显示 */}
          {repostAuthor && (
            <div className='flex items-center gap-2'>
              <IconUser
                size={14}
                stroke={1.5}
                className='text-[var(--endspace-text-muted)]'
              />
              <span>{repostAuthor}</span>
            </div>
          )}

          {/* Last Update Time */}
          {post.lastEditedDay &&
            post.lastEditedDay !== post.publishDay && (
              <div className='flex items-center gap-2'>
                <IconRefresh
                  size={14}
                  stroke={1.5}
                  className='text-[var(--endspace-text-muted)]'
                />
                <span>UPDATED: {post.lastEditedDay}</span>
              </div>
            )}

          {/* Category */}
          {post.category && (
            <div className='flex items-center gap-2'>
              <IconFolder
                size={14}
                stroke={1.5}
                className='text-[var(--endspace-text-muted)]'
              />
              <span className='font-bold text-[var(--endspace-text-primary)]'>
                {post.category.toUpperCase()}
              </span>
            </div>
          )}

          {/* Reading Time / Count */}
          <div className='flex items-center gap-2'>
            <IconFileText
              size={14}
              stroke={1.5}
              className='text-[var(--endspace-text-muted)]'
            />
            <span>{post.wordCount || '-'} CHARS</span>
          </div>

          {/* Tags - Minimalist Pills */}
          {post.tags && post.tags.length > 0 && (
            <div className='ml-auto flex items-center gap-2'>
              {post.tags.map(tag => (
                <span
                  key={tag}
                  className='cursor-pointer rounded bg-[var(--endspace-bg-secondary)] px-2 py-1 text-xs text-[var(--endspace-text-secondary)] transition-colors hover:bg-[var(--endspace-text-primary)] hover:text-white'>
                  #{tag.toUpperCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
