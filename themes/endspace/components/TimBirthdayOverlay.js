'use client'

import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'

/* =========================================================
 * Tim Drake Birthday Celebration
 *
 * 每年 7 月 13 日 ～ 7 月 20 日自动启用
 * 使用北京时间 Asia/Shanghai 判断
 *
 * 播放顺序：
 * LoadingCover 完全结束
 * → 正式首页出现
 * → 等待 180ms
 * → 生日庆祝动画出现
 * → 展示 4.5 秒
 * → 0.5 秒淡出
 *
 * 同一个浏览会话只播放一次
 * =========================================================
 */

const BIRTHDAY_IMAGE =
  'https://i.ibb.co/bR1hqXYT/39496570-2026-07-14-12-59-17.webp'

// 每年的生日庆祝日期范围
const START_MONTH = 7
const START_DAY = 13

const END_MONTH = 7
const END_DAY = 20

// 统一按照北京时间判断
const TIME_ZONE = 'Asia/Shanghai'

// LoadingCover 完全消失后，稍等一下再出现生日动画
const START_DELAY_AFTER_LOADING = 180

// 正常展示 4.5 秒
const DISPLAY_DURATION = 4500

// 最后用 0.5 秒淡出
const FADE_DURATION = 500

// sessionStorage 标记
const SESSION_KEY_PREFIX = 'tim-birthday-celebration'

/**
 * 获取北京时间下的年、月、日
 */
const getChinaDateParts = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(new Date())

  const date = {}

  for (const part of parts) {
    if (part.type !== 'literal') {
      date[part.type] = Number(part.value)
    }
  }

  return date
}

/**
 * 判断当前日期是否处于生日庆祝期间
 */
const isBirthdayWindow = ({ month, day }) => {
  const current = month * 100 + day
  const start = START_MONTH * 100 + START_DAY
  const end = END_MONTH * 100 + END_DAY

  return current >= start && current <= end
}

/**
 * 提姆·德雷克生日庆祝组件
 */
const TimBirthdayOverlay = () => {
  const router = useRouter()

  const canvasRef = useRef(null)
  const previousOverflowRef = useRef('')

  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  /* =========================================================
   * 控制生日庆祝层什么时候出现
   * =========================================================
   */
  useEffect(() => {
    // 路由还没有准备完成
    if (!router.isReady) return

    // 只在网站首页出现
    if (router.pathname !== '/') return

    const chinaDate = getChinaDateParts()

    // 不在每年 7.13 ～ 7.20，不显示
    if (!isBirthdayWindow(chinaDate)) return

    // 每一年使用单独的 session key
    const sessionKey = `${SESSION_KEY_PREFIX}-${chinaDate.year}`

    // 当前浏览会话已经播放过，不重复播放
    if (window.sessionStorage.getItem(sessionKey) === 'shown') {
      return
    }

    let observer = null
    let startTimer = null
    let leaveTimer = null
    let hideTimer = null
    let preloadImage = null

    let cancelled = false
    let started = false

    let imageReady = false
    let loadingCoverFinished = false

    /**
     * 恢复网页滚动
     */
    const restoreScroll = () => {
      document.body.style.overflow = previousOverflowRef.current
    }

    /**
     * 同时满足两个条件后才开始：
     *
     * 1. LoadingCover 已经完全消失
     * 2. 提姆生日动画图片已经预加载完成
     */
    const maybeStartCelebration = () => {
      if (
        cancelled ||
        started ||
        !imageReady ||
        !loadingCoverFinished
      ) {
        return
      }

      started = true

      // LoadingCover 结束后稍微停顿一下，
      // 让访客真正看到首页已经进入，再开始庆祝动画
      startTimer = window.setTimeout(() => {
        if (cancelled) return

        // 当前浏览会话标记为已经展示
        window.sessionStorage.setItem(sessionKey, 'shown')

        // 保存原来的滚动状态
        previousOverflowRef.current = document.body.style.overflow

        // 庆祝动画期间禁止背景页面滚动
        document.body.style.overflow = 'hidden'

        setIsLeaving(false)
        setIsVisible(true)

        // 4.5 秒后开始淡出
        leaveTimer = window.setTimeout(() => {
          setIsLeaving(true)
        }, DISPLAY_DURATION)

        // 淡出完成后彻底移除
        hideTimer = window.setTimeout(() => {
          setIsVisible(false)
          restoreScroll()
        }, DISPLAY_DURATION + FADE_DURATION)
      }, START_DELAY_AFTER_LOADING)
    }

    /**
     * 提前加载生日动画图片
     *
     * 避免背景已经出现，
     * 但中间图片还没加载出来。
     */
    preloadImage = new window.Image()

    preloadImage.onload = () => {
      imageReady = true
      maybeStartCelebration()
    }

    preloadImage.onerror = () => {
      // 即使图床临时加载失败，
      // 也不能让整个页面逻辑卡死
      imageReady = true
      maybeStartCelebration()
    }

    preloadImage.src = BIRTHDAY_IMAGE

    if (preloadImage.complete) {
      imageReady = true
    }

    /**
     * 等待 LoadingCover 完全消失
     *
     * LoadingCover 存在时：
     * 持续观察 DOM，直到 .loading-cover 真正消失。
     *
     * LoadingCover 不存在时：
     * 直接允许生日动画开始。
     */
    const waitForLoadingCover = () => {
      const loadingCover = document.querySelector('.loading-cover')

      // 没有 LoadingCover
      if (!loadingCover) {
        loadingCoverFinished = true
        maybeStartCelebration()
        return
      }

      // LoadingCover 还存在
      // 等待它真正从 DOM 中消失
      observer = new MutationObserver(() => {
        const currentLoadingCover =
          document.querySelector('.loading-cover')

        if (!currentLoadingCover) {
          loadingCoverFinished = true

          if (observer) {
            observer.disconnect()
          }

          maybeStartCelebration()
        }
      })

      observer.observe(document.body, {
        childList: true,
        subtree: true
      })
    }

    // React 完成当前页面挂载后再检查 LoadingCover
    const kickoffTimer = window.setTimeout(
      waitForLoadingCover,
      0
    )

    /**
     * 清理
     */
    return () => {
      cancelled = true

      window.clearTimeout(kickoffTimer)
      window.clearTimeout(startTimer)
      window.clearTimeout(leaveTimer)
      window.clearTimeout(hideTimer)

      if (observer) {
        observer.disconnect()
      }

      if (preloadImage) {
        preloadImage.onload = null
        preloadImage.onerror = null
      }

      if (started) {
        restoreScroll()
      }
    }
  }, [router.isReady, router.pathname])

  /* =========================================================
   * Canvas 礼花动画
   * =========================================================
   */
  useEffect(() => {
    if (!isVisible || !canvasRef.current) return

    // 尊重系统的“减少动态效果”设置
    if (
      window.matchMedia &&
      window
        .matchMedia('(prefers-reduced-motion: reduce)')
        .matches
    ) {
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight

    let animationFrameId = null
    let burstIntervalId = null
    let stopBurstTimerId = null

    let particles = []

    // 礼花颜色
    const colors = [
      '#ffffff',
      '#f7d046',
      '#ff8f8f',
      '#7ed6df',
      '#a8e6cf',
      '#ffd3e0',
      '#ef5350',
      '#8bc34a',
      '#ffca5c',
      '#b39ddb'
    ]

    /**
     * 调整 Canvas 大小
     */
    const resizeCanvas = () => {
      width = window.innerWidth
      height = window.innerHeight

      // 最多使用 2 倍 DPR，避免性能负担过重
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        2
      )

      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)

      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      )
    }

    /**
     * 创建一个礼花粒子
     */
    const createParticle = side => {
      const isLeft = side === 'left'

      /*
       * 左边礼花朝右上方喷
       * 右边礼花朝左上方喷
       */
      const angle = isLeft
        ? -(0.65 + Math.random() * 0.75)
        : -(
            Math.PI -
            (0.65 + Math.random() * 0.75)
          )

      const speed = 8 + Math.random() * 8
      const maxLife = 100 + Math.random() * 70

      return {
        // 出生位置
        x: isLeft
          ? width * (0.01 + Math.random() * 0.05)
          : width * (0.94 + Math.random() * 0.05),

        y:
          height *
          (0.78 + Math.random() * 0.16),

        // 初始速度
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,

        // 重力
        gravity:
          0.12 + Math.random() * 0.08,

        // 粒子大小
        size: 5 + Math.random() * 7,

        // 长宽比例
        aspect:
          0.45 + Math.random() * 1.1,

        // 旋转
        rotation:
          Math.random() * Math.PI * 2,

        rotationSpeed:
          (Math.random() - 0.5) * 0.28,

        // 随机颜色
        color:
          colors[
            Math.floor(
              Math.random() * colors.length
            )
          ],

        // 大部分是纸片，少部分是圆形
        shape:
          Math.random() > 0.22
            ? 'rect'
            : 'circle',

        life: maxLife,
        maxLife
      }
    }

    /**
     * 喷射一轮礼花
     */
    const spawnBurst = side => {
      // 手机减少粒子数量，降低性能消耗
      const particleCount =
        width < 768 ? 7 : 11

      for (
        let i = 0;
        i < particleCount;
        i++
      ) {
        particles.push(
          createParticle(side)
        )
      }
    }

    /**
     * 礼花动画循环
     */
    const animate = () => {
      ctx.clearRect(
        0,
        0,
        width,
        height
      )

      particles = particles.filter(
        particle => {
          // 水平方向略微减速
          particle.vx *= 0.995

          // 重力
          particle.vy += particle.gravity

          // 更新位置
          particle.x += particle.vx
          particle.y += particle.vy

          // 更新旋转
          particle.rotation +=
            particle.rotationSpeed

          // 生命周期减少
          particle.life -= 1

          // 生命周期结束或飞出屏幕
          if (
            particle.life <= 0 ||
            particle.y > height + 100 ||
            particle.x < -100 ||
            particle.x > width + 100
          ) {
            return false
          }

          const lifeRatio =
            particle.life /
            particle.maxLife

          ctx.save()

          // 临近消失时逐渐变透明
          ctx.globalAlpha = Math.min(
            1,
            lifeRatio * 1.8
          )

          ctx.translate(
            particle.x,
            particle.y
          )

          ctx.rotate(
            particle.rotation
          )

          ctx.fillStyle =
            particle.color

          if (
            particle.shape === 'circle'
          ) {
            ctx.beginPath()

            ctx.arc(
              0,
              0,
              particle.size * 0.45,
              0,
              Math.PI * 2
            )

            ctx.fill()
          } else {
            ctx.fillRect(
              -particle.size / 2,
              -(
                particle.size *
                particle.aspect
              ) / 2,
              particle.size,
              particle.size *
                particle.aspect
            )
          }

          ctx.restore()

          return true
        }
      )

      animationFrameId =
        window.requestAnimationFrame(
          animate
        )
    }

    resizeCanvas()

    window.addEventListener(
      'resize',
      resizeCanvas
    )

    // 一出现就左右各喷一次
    spawnBurst('left')
    spawnBurst('right')

    /*
     * 前 2.8 秒持续喷射。
     * 后面留时间让已经喷出的礼花自然落下。
     */
    burstIntervalId =
      window.setInterval(() => {
        spawnBurst('left')
        spawnBurst('right')
      }, 170)

    stopBurstTimerId =
      window.setTimeout(() => {
        window.clearInterval(
          burstIntervalId
        )
      }, 2800)

    animationFrameId =
      window.requestAnimationFrame(
        animate
      )

    /**
     * 清理动画
     */
    return () => {
      window.removeEventListener(
        'resize',
        resizeCanvas
      )

      window.clearInterval(
        burstIntervalId
      )

      window.clearTimeout(
        stopBurstTimerId
      )

      if (animationFrameId) {
        window.cancelAnimationFrame(
          animationFrameId
        )
      }
    }
  }, [isVisible])

  /* =========================================================
   * 没有开始时完全不渲染
   * =========================================================
   */
  if (
    !isVisible ||
    router.pathname !== '/'
  ) {
    return null
  }

  /* =========================================================
   * 页面内容
   * =========================================================
   */
  return (
    <div
      className={`tim-birthday-overlay ${
        isLeaving ? 'is-leaving' : ''
      }`}
      role="status"
      aria-label="提姆·德雷克生日快乐"
    >
      {/* Canvas 礼花 */}
      <canvas
        ref={canvasRef}
        className="tim-birthday-confetti"
        aria-hidden="true"
      />

      {/* 中央内容 */}
      <div className="tim-birthday-content">
        <img
          src={BIRTHDAY_IMAGE}
          alt="提姆·德雷克生日快乐"
          className="tim-birthday-image"
          draggable="false"
        />

        <div className="tim-birthday-title">
          提姆·德雷克生日快乐
        </div>
      </div>

      <style jsx>{`
        /* ==========================================
         * 全屏生日庆祝层
         * ========================================== */
        .tim-birthday-overlay {
          position: fixed;
          inset: 0;

          width: 100vw;
          height: 100vh;

          display: flex;
          align-items: center;
          justify-content: center;

          overflow: hidden;

          /*
           * 比普通网页内容高，
           * 但低于原本 LoadingCover 的 99999。
           */
          z-index: 99990;

          /*
           * 非黑色遮罩。
           *
           * 只添加一层浅白透明雾面，
           * 保留下方网页的颜色和轮廓。
           */
          background:
            rgba(255, 255, 255, 0.2);

          /*
           * 毛玻璃效果。
           *
           * 模糊下方网页，
           * 同时略微降低饱和度，
           * 避免背景内容太杂乱。
           */
          -webkit-backdrop-filter:
            blur(16px)
            saturate(0.8);

          backdrop-filter:
            blur(16px)
            saturate(0.8);

          animation:
            timBirthdayOverlayIn
            0.55s
            ease-out
            both;
        }

        /* 整个庆祝层退场 */
        .tim-birthday-overlay.is-leaving {
          animation:
            timBirthdayOverlayOut
            ${FADE_DURATION}ms
            ease-in
            forwards;
        }

        /* ==========================================
         * 礼花 Canvas
         * ========================================== */
        .tim-birthday-confetti {
          position: absolute;
          inset: 0;

          width: 100%;
          height: 100%;

          z-index: 1;

          pointer-events: none;
        }

        /* ==========================================
         * 中央内容
         * ========================================== */
        .tim-birthday-content {
          position: relative;

          z-index: 2;

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          width: min(92vw, 620px);

          padding: 24px;

          text-align: center;

          user-select: none;

          animation:
            timBirthdayContentIn
            0.72s
            cubic-bezier(
              0.22,
              1,
              0.36,
              1
            )
            0.08s
            both;
        }

        /*
         * 退场时，
         * 中央内容轻微向上移动并缩小。
         */
        .is-leaving
          .tim-birthday-content {
          animation:
            timBirthdayContentOut
            0.42s
            ease-in
            forwards;
        }

        /* ==========================================
         * 提姆生日动画图片
         * ========================================== */
        .tim-birthday-image {
          display: block;

          width: min(300px, 62vw);
          height: auto;

          object-fit: contain;

          pointer-events: none;

          border: 4px solid #FFE4B5;
          background: #ffffff;
        }

          /*
           * 非常轻的阴影，
           * 让图片和模糊背景稍微分离。
           */
          filter:
            drop-shadow(
              0 12px 28px
              rgba(0, 0, 0, 0.12)
            )
            drop-shadow(
              0 2px 8px
              rgba(255, 255, 255, 0.2)
            );
        }

        /* ==========================================
         * 生日祝福文字
         * ========================================== */
        .tim-birthday-title {
          margin-top: 18px;

          /*
           * 改成柔和的深黑色。
           * 在浅色毛玻璃上比白字清晰。
           */
          color: #171717;

          font-size:
            clamp(
              1.35rem,
              3vw,
              2rem
            );

          font-weight: 700;
          line-height: 1.5;

          letter-spacing: 0.12em;
        }

        /* ==========================================
         * 入场动画
         * ========================================== */
        @keyframes timBirthdayOverlayIn {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        /* ==========================================
         * 整体淡出
         * ========================================== */
        @keyframes timBirthdayOverlayOut {
          from {
            opacity: 1;
          }

          to {
            opacity: 0;
          }
        }

        /* ==========================================
         * 中央内容入场
         * ========================================== */
        @keyframes timBirthdayContentIn {
          from {
            opacity: 0;

            transform:
              translateY(24px)
              scale(0.94);
          }

          to {
            opacity: 1;

            transform:
              translateY(0)
              scale(1);
          }
        }

        /* ==========================================
         * 中央内容退场
         * ========================================== */
        @keyframes timBirthdayContentOut {
          from {
            opacity: 1;

            transform:
              translateY(0)
              scale(1);
          }

          to {
            opacity: 0;

            transform:
              translateY(-10px)
              scale(0.98);
          }
        }

        /* ==========================================
         * 手机适配
         * ========================================== */
        @media (max-width: 768px) {
          .tim-birthday-overlay {
            -webkit-backdrop-filter:
              blur(14px)
              saturate(0.8);

            backdrop-filter:
              blur(14px)
              saturate(0.8);
          }

          .tim-birthday-content {
            padding: 18px;
          }

          .tim-birthday-image {
            width:
              min(
                230px,
                64vw
              );
          }

          .tim-birthday-title {
            margin-top: 14px;

            font-size:
              clamp(
                1.05rem,
                5vw,
                1.35rem
              );

            letter-spacing: 0.08em;
          }
        }

        /* ==========================================
         * 系统减少动态效果
         * ========================================== */
        @media (
          prefers-reduced-motion:
            reduce
        ) {
          .tim-birthday-overlay,
          .tim-birthday-content,
          .is-leaving
            .tim-birthday-content {
            animation-duration:
              0.01ms !important;
          }
        }
      `}</style>
    </div>
  )
}

export default TimBirthdayOverlay
