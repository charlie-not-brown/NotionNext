import { useEffect, useMemo, useState } from 'react'
import { siteConfig } from '@/lib/config'
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerTrackPrev,
  IconPlayerTrackNext,
  IconMusic,
  IconList,
  IconVolume,
} from '@tabler/icons-react'

// ---------- shared player core ----------
let sharedAudio = null
let sharedAudioList = []
let sharedPlayOrder = 'list'
let progressTimer = null
let mediaGuardTimer = null
let playRequestId = 0
let hasTriedAutoPlay = false

let sharedState = {
  isPlaying: false,
  currentTrack: 0,
  progress: 0,
  duration: 0,
  currentTime: 0,
}

const subscribers = new Set()

const emitSharedState = (patch = {}) => {
  sharedState = { ...sharedState, ...patch }
  subscribers.forEach(listener => listener(sharedState))
}

const parseBoolean = value => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return Boolean(value)
}

const toHttps = url => (typeof url === 'string' ? url.replace(/^http:\/\//, 'https://') : '')

const getSharedAudio = () => {
  if (typeof Audio === 'undefined') return null
  if (sharedAudio) return sharedAudio

  sharedAudio = new Audio()
  sharedAudio.volume = 0.7
  sharedAudio.setAttribute('data-endspace-player', 'true')

  sharedAudio.addEventListener('ended', () => {
    playSharedTrack(getNextTrackIndex(), true)
  })

  sharedAudio.addEventListener('loadedmetadata', () => {
    emitSharedState({
      duration: sharedAudio?.duration || 0,
    })
  })

  sharedAudio.addEventListener('play', () => {
    emitSharedState({ isPlaying: true })
    startProgressTimer()
    startMediaGuard()
  })

  sharedAudio.addEventListener('pause', () => {
    if (!sharedAudio?.ended) {
      emitSharedState({ isPlaying: false })
      stopProgressTimer()
      stopMediaGuard()
    }
  })

  sharedAudio.addEventListener('error', event => {
    console.error('Audio load error:', event)
  })

  return sharedAudio
}

const subscribeSharedPlayer = listener => {
  subscribers.add(listener)
  listener(sharedState)

  return () => {
    subscribers.delete(listener)
    if (subscribers.size === 0) {
      pauseSharedPlayer()
    }
  }
}

const configureSharedPlayer = (audioList, playOrder) => {
  sharedAudioList = Array.isArray(audioList) ? audioList : []
  sharedPlayOrder = playOrder || 'list'

  if (sharedState.currentTrack >= sharedAudioList.length) {
    emitSharedState({ currentTrack: 0, progress: 0, currentTime: 0 })
  }

  getSharedAudio()
}

const getNextTrackIndex = () => {
  if (sharedAudioList.length === 0) return 0
  if (sharedPlayOrder === 'random') {
    return Math.floor(Math.random() * sharedAudioList.length)
  }
  return (sharedState.currentTrack + 1) % sharedAudioList.length
}

const getPrevTrackIndex = () => {
  if (sharedAudioList.length === 0) return 0
  return (sharedState.currentTrack - 1 + sharedAudioList.length) % sharedAudioList.length
}

const updateProgressFromAudio = () => {
  if (!sharedAudio) return
  const current = sharedAudio.currentTime || 0
  const total = sharedAudio.duration || 1
  emitSharedState({
    currentTime: current,
    duration: sharedAudio.duration || 0,
    progress: (current / total) * 100,
  })
}

const startProgressTimer = () => {
  if (typeof window === 'undefined') return
  stopProgressTimer()
  updateProgressFromAudio()
  progressTimer = window.setInterval(updateProgressFromAudio, 200)
}

const stopProgressTimer = () => {
  if (!progressTimer) return
  if (typeof window !== 'undefined') window.clearInterval(progressTimer)
  progressTimer = null
}

const pauseOtherMedia = () => {
  if (typeof document === 'undefined') return
  document.querySelectorAll('audio, video').forEach(media => {
    if (media !== sharedAudio && !media.paused) {
      media.pause()
    }
  })
}

const startMediaGuard = () => {
  if (typeof window === 'undefined') return
  stopMediaGuard()
  pauseOtherMedia()
  mediaGuardTimer = window.setInterval(pauseOtherMedia, 800)
}

const stopMediaGuard = () => {
  if (!mediaGuardTimer) return
  if (typeof window !== 'undefined') window.clearInterval(mediaGuardTimer)
  mediaGuardTimer = null
}

const playSharedAudio = async () => {
  const audio = getSharedAudio()
  if (!audio) return

  pauseOtherMedia()
  audio.muted = false

  try {
    await audio.play()
  } catch (error) {
    console.log('Play prevented:', error)
    emitSharedState({ isPlaying: false })
    stopProgressTimer()
    stopMediaGuard()
  }
}

const pauseSharedPlayer = () => {
  if (sharedAudio) sharedAudio.pause()
  emitSharedState({ isPlaying: false })
  stopProgressTimer()
  stopMediaGuard()
}

const playSharedTrack = (index, shouldPlay = sharedState.isPlaying) => {
  if (sharedAudioList.length === 0) return

  const safeIndex = (index + sharedAudioList.length) % sharedAudioList.length
  const audioConfig = sharedAudioList[safeIndex]
  const audio = getSharedAudio()
  if (!audioConfig?.url || !audio) return

  const requestId = ++playRequestId

  audio.pause()
  if (audio.src !== audioConfig.url) {
    audio.src = audioConfig.url
  }
  audio.load()

  emitSharedState({
    currentTrack: safeIndex,
    progress: 0,
    currentTime: 0,
    duration: 0,
    isPlaying: shouldPlay,
  })

  if (shouldPlay) {
    if (typeof window === 'undefined') return
    window.setTimeout(() => {
      if (requestId === playRequestId) {
        playSharedAudio()
      }
    }, 0)
  }
}

// ---------- meting ----------
const fetchMetingPlaylist = async (server, id) => {
  try {
    const apiUrl = `https://163.hyc.moe?server=${encodeURIComponent(server)}&type=playlist&id=${encodeURIComponent(id)}`
    const response = await fetch(apiUrl, { cache: 'no-store' })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    const list =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.songs)
            ? data.songs
            : null

    if (!list) throw new Error('Invalid playlist response')

    return list
      .map(item => ({
        name: item.name || item.title || 'Unknown Track',
        artist: item.artist || item.artist_name || item.author || 'Unknown Artist',
        url: toHttps(item.url || item.src || ''),
        cover: toHttps(item.pic || item.cover || item.image || ''),
        lrc: item.lrc || '',
      }))
      .filter(item => item.url)
  } catch (error) {
    console.error('Meting fetch failed:', error)
    return []
  }
}

export const EndspacePlayer = ({ isExpanded, embedded = false }) => {
  const [playerState, setPlayerState] = useState(sharedState)
  const [showPlaylist, setShowPlaylist] = useState(false)
  const [metingAudioList, setMetingAudioList] = useState(null)

  const musicPlayerEnabled = parseBoolean(siteConfig('MUSIC_PLAYER'))
  const autoPlay = parseBoolean(siteConfig('MUSIC_PLAYER_AUTO_PLAY'))
  const playOrder = siteConfig('MUSIC_PLAYER_ORDER') || 'list'
  const localAudioList = Array.isArray(siteConfig('MUSIC_PLAYER_AUDIO_LIST'))
    ? siteConfig('MUSIC_PLAYER_AUDIO_LIST')
    : []

  const metingEnabled = parseBoolean(siteConfig('MUSIC_PLAYER_METING'))
  const metingServer = siteConfig('MUSIC_PLAYER_METING_SERVER') || 'netease'
  const metingId = siteConfig('MUSIC_PLAYER_METING_ID')

  const finalAudioList = useMemo(() => {
    if (metingEnabled) {
      if (Array.isArray(metingAudioList) && metingAudioList.length > 0) return metingAudioList
      if (metingAudioList === null) return localAudioList
      return localAudioList
    }
    return localAudioList
  }, [metingEnabled, metingAudioList, localAudioList])

  const { isPlaying, currentTrack, progress, currentTime } = playerState
  const currentAudio = finalAudioList[currentTrack] || {}

  useEffect(() => {
    if (!musicPlayerEnabled) return
    if (!metingEnabled || !metingId) return
    if (metingAudioList !== null) return

    let cancelled = false

    fetchMetingPlaylist(metingServer, metingId).then(list => {
      if (cancelled) return
      setMetingAudioList(Array.isArray(list) ? list : [])
    })

    return () => {
      cancelled = true
    }
  }, [musicPlayerEnabled, metingEnabled, metingServer, metingId, metingAudioList])

  useEffect(() => {
    if (!musicPlayerEnabled || finalAudioList.length === 0) return undefined

    configureSharedPlayer(finalAudioList, playOrder)
    const unsubscribe = subscribeSharedPlayer(setPlayerState)

    if (autoPlay && !hasTriedAutoPlay) {
      hasTriedAutoPlay = true
      playSharedTrack(sharedState.currentTrack, true)
    }

    return unsubscribe
  }, [finalAudioList, playOrder, musicPlayerEnabled, autoPlay])

  useEffect(() => {
    if (!isExpanded) setShowPlaylist(false)
  }, [isExpanded])

  if (!musicPlayerEnabled) return null
  if (finalAudioList.length === 0) return null

  const togglePlay = e => {
    e.stopPropagation()
    if (isPlaying) {
      pauseSharedPlayer()
      return
    }

    const audio = getSharedAudio()
    if (audio && !audio.src && currentAudio?.url) {
      playSharedTrack(currentTrack, true)
    } else {
      emitSharedState({ isPlaying: true })
      playSharedAudio()
    }
  }

  const playNext = e => {
    e?.stopPropagation()
    playSharedTrack(getNextTrackIndex(), isPlaying)
  }

  const playPrev = e => {
    e?.stopPropagation()
    playSharedTrack(getPrevTrackIndex(), isPlaying)
  }

  const selectTrack = index => {
    setShowPlaylist(false)
    playSharedTrack(index, true)
  }

  const handleProgressClick = e => {
    const audio = getSharedAudio()
    if (!audio || !audio.duration) return

    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percentage = clickX / rect.width

    audio.currentTime = percentage * audio.duration
    updateProgressFromAudio()
  }

  const formatTime = seconds => {
    if (!seconds || Number.isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isExpanded) {
    return (
      <div className={`endspace-player-mini flex justify-center ${embedded ? 'py-0' : 'py-2'}`}>
        <div
          className="relative flex h-10 w-10 items-center justify-center"
          onClick={togglePlay}
        >
          {isPlaying ? (
            <>
              <div className="endspace-player-rotating endspace-player-glow h-full w-full overflow-hidden rounded-full">
                <img
                  src={currentAudio.cover || '/default-cover.jpg'}
                  alt="Cover"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <IconPlayerPause size={14} stroke={2} className="text-white" />
              </div>
            </>
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center text-[var(--endspace-text-muted)] transition-all hover:bg-gray-200 hover:text-gray-600 ${embedded ? 'rounded-full bg-transparent' : 'rounded-lg bg-[var(--endspace-bg-secondary)]'}`}
            >
              <IconMusic size={18} stroke={1.5} />
            </div>
          )}
        </div>
      </div>
    )
  }

  if (embedded) {
    return (
      <div className="endspace-player-full relative flex h-full w-full items-center px-0.5">
        {showPlaylist && (
          <div className="absolute bottom-full left-0 right-0 mb-2 max-h-32 overflow-y-auto rounded-xl border border-gray-200 bg-gray-100/95 p-1 shadow-lg">
            {finalAudioList.map((audio, index) => (
              <button
                key={index}
                type="button"
                onClick={() => selectTrack(index)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                  index === currentTrack
                    ? 'bg-black text-white'
                    : 'text-[var(--endspace-text-secondary)] hover:bg-gray-200 hover:text-black'
                }`}
              >
                <span className="w-3 flex-shrink-0 text-center font-mono text-[9px] leading-none">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-semibold leading-tight">
                    {audio.name}
                  </span>
                  <span
                    className={`block truncate text-[9px] leading-tight ${
                      index === currentTrack ? 'text-white/70' : 'text-[var(--endspace-text-muted)]'
                    }`}
                  >
                    {audio.artist || 'Unknown Artist'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              setShowPlaylist(!showPlaylist)
            }}
            className="group/cover relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/70 text-[var(--endspace-text-muted)] transition-colors hover:text-black"
            title="Playlist"
          >
            <img
              src={currentAudio.cover || '/default-cover.jpg'}
              alt="Cover"
              className={`h-full w-full rounded-full object-cover transition-opacity ${
                showPlaylist ? 'opacity-20' : 'opacity-100 group-hover/cover:opacity-20'
              }`}
            />
            <span
              className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                showPlaylist ? 'opacity-100' : 'opacity-0 group-hover/cover:opacity-100'
              }`}
            >
              <IconList size={14} stroke={1.5} />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold leading-tight text-[var(--endspace-text-primary)]">
              {currentAudio.name || 'Unknown Track'}
            </div>
            <div className="mt-0.5 truncate text-[10px] leading-tight text-[var(--endspace-text-muted)]">
              {currentAudio.artist || formatTime(currentTime)}
            </div>
            <div
              className="mt-1 h-1 overflow-hidden rounded-full bg-gray-200"
              onClick={handleProgressClick}
            >
              <div
                className="h-full bg-[var(--endspace-accent-yellow)] transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="flex h-10 w-5 flex-shrink-0 flex-col items-center justify-between rounded-lg bg-gray-200/70 p-0.5 text-[var(--endspace-text-muted)]">
            <button
              onClick={playPrev}
              className="flex h-3 w-4 items-center justify-center rounded transition-colors hover:bg-[var(--endspace-accent-yellow)] hover:text-black"
              title="Previous"
            >
              <IconPlayerTrackPrev size={10} stroke={2} className="rotate-90" />
            </button>
            <button
              type="button"
              className={`flex h-3.5 w-4 items-center justify-center rounded transition-colors hover:bg-[var(--endspace-accent-yellow)] hover:text-black ${
                isPlaying ? 'bg-[var(--endspace-accent-yellow)] text-black' : ''
              }`}
              onClick={togglePlay}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <IconPlayerPause size={14} stroke={2.5} />
              ) : (
                <IconPlayerPlay size={12} stroke={2.5} className="ml-0.5" />
              )}
            </button>
            <button
              onClick={playNext}
              className="flex h-3 w-4 items-center justify-center rounded transition-colors hover:bg-[var(--endspace-accent-yellow)] hover:text-black"
              title="Next"
            >
              <IconPlayerTrackNext size={10} stroke={2} className="rotate-90" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="endspace-player-full relative px-3 py-3">
      <div className="flex items-start gap-3">
        <div
          className={`relative h-12 w-12 flex-shrink-0 cursor-pointer overflow-hidden rounded ${isPlaying ? 'endspace-player-glow' : ''}`}
          onClick={togglePlay}
        >
          <img
            src={currentAudio.cover || '/default-cover.jpg'}
            alt="Album Cover"
            className={`h-full w-full object-cover transition-transform duration-300 ${isPlaying ? 'scale-105' : ''}`}
          />
          <div
            className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity ${
              isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
            }`}
          >
            {isPlaying ? (
              <IconPlayerPause size={16} stroke={2} className="text-white" />
            ) : (
              <IconPlayerPlay size={16} stroke={2} className="ml-0.5 text-white" />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold leading-tight text-[var(--endspace-text-primary)]">
            {currentAudio.name || 'Unknown Track'}
          </div>
          <div className="mt-0.5 truncate text-xs text-[var(--endspace-text-muted)]">
            {currentAudio.artist || 'Unknown Artist'}
          </div>

          <div className="mt-1.5 flex items-center gap-2">
            <div
              className="h-1 flex-1 cursor-pointer overflow-hidden rounded-full bg-[var(--endspace-bg-tertiary)]"
              onClick={handleProgressClick}
            >
              <div
                className="h-full bg-[var(--endspace-accent-yellow)] transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="w-8 text-right font-mono text-[9px] text-[var(--endspace-text-muted)]">
              {formatTime(currentTime)}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <button
            onClick={e => {
              e.stopPropagation()
              setShowPlaylist(!showPlaylist)
            }}
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
              showPlaylist ? 'bg-black text-white' : 'text-[var(--endspace-text-muted)] hover:text-black'
            }`}
            title="Playlist"
          >
            <IconList size={12} stroke={1.5} />
          </button>

          <div className="flex items-center gap-0.5">
            <button
              onClick={playPrev}
              className="flex h-5 w-5 items-center justify-center text-[var(--endspace-text-muted)] transition-colors hover:text-black"
              title="Previous"
            >
              <IconPlayerTrackPrev size={11} stroke={1.5} />
            </button>
            <button
              onClick={playNext}
              className="flex h-5 w-5 items-center justify-center text-[var(--endspace-text-muted)] transition-colors hover:text-black"
              title="Next"
            >
              <IconPlayerTrackNext size={11} stroke={1.5} />
            </button>
          </div>
        </div>
      </div>

      {showPlaylist && (
        <div className="mt-2 max-h-36 overflow-y-auto rounded bg-[var(--endspace-bg-secondary)]">
          {finalAudioList.map((audio, index) => (
            <div
              key={index}
              onClick={() => selectTrack(index)}
              className={`cursor-pointer px-3 py-1.5 transition-colors ${
                index === currentTrack
                  ? 'bg-black text-white'
                  : 'hover:bg-[var(--endspace-bg-tertiary)]'
              }`}
            >
              <div
                className={`flex items-center gap-1.5 truncate text-xs ${
                  index === currentTrack ? 'font-medium text-white' : 'text-[var(--endspace-text-secondary)]'
                }`}
              >
                {index === currentTrack && isPlaying && (
                  <IconVolume size={11} stroke={1.5} className="flex-shrink-0" />
                )}
                {index === currentTrack && !isPlaying && (
                  <IconPlayerPause size={11} stroke={1.5} className="flex-shrink-0" />
                )}
                {index !== currentTrack && (
                  <span className="w-3 flex-shrink-0 text-center font-mono text-[9px] text-[var(--endspace-text-muted)]">
                    {index + 1}
                  </span>
                )}
                <span className="truncate">{audio.name}</span>
              </div>
              <div className="mt-0.5 truncate pl-4 text-[10px] text-[var(--endspace-text-muted)]">
                {audio.artist || 'Unknown Artist'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default EndspacePlayer
