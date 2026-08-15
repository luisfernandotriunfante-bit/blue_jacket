import { useEffect, useRef } from 'react'

const PIXELS_PER_LOOP = 720
const FALLBACK_FRAME_COUNT = 6
const FALLBACK_COLUMNS = 3
const SCROLL_STOP_DELAY = 520
const ROTATION_PER_PIXEL = 0.58
const MOTION_EASING = 0.22

// Visual media is pinned to the last validated visual checkpoint of the old project.
// No business code or runtime logic is imported from that repository.
const VALIDATED_VISUAL_ASSET_BASE =
  'https://raw.githubusercontent.com/luisfernandotriunfante-bit/painel/c55b4953b1958f69ac22e4be9f809605de4ee1ed/'

const HQ_CANDIDATES = [
  ['public/triunfante-hq-v2/part00.txt', 'public/triunfante-hq-v2/part01.txt'],
  ['public/triunfante-hq-v4/part00.txt', 'public/triunfante-hq-v4/part01.txt'],
]

const FALLBACK_PART = 'src/triunfante-user/sprite6-full.txt'

type VideoCandidate = {
  url: string
  width: number
  height: number
  duration: number
  bytes: number
  label: string
}

function assetUrl(path: string) {
  return new URL(path, VALIDATED_VISUAL_ASSET_BASE).toString()
}

function base64ToObjectUrl(base64: string, type: string) {
  const clean = base64.replace(/\s+/g, '')
  const binary = window.atob(clean)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return {
    url: URL.createObjectURL(new Blob([bytes], { type })),
    bytes: bytes.byteLength,
  }
}

async function fetchText(path: string) {
  const response = await fetch(assetUrl(path), { cache: 'force-cache' })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response.text()
}

async function buildCandidate(parts: string[]): Promise<VideoCandidate | null> {
  try {
    const texts = await Promise.all(parts.map(fetchText))
    const { url, bytes } = base64ToObjectUrl(texts.join(''), 'video/webm')
    const probe = document.createElement('video')
    probe.muted = true
    probe.playsInline = true
    probe.preload = 'metadata'

    const metadata = await new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('metadata timeout')), 5000)
      const cleanup = () => window.clearTimeout(timeout)

      probe.addEventListener(
        'loadedmetadata',
        () => {
          cleanup()
          resolve({ width: probe.videoWidth, height: probe.videoHeight, duration: probe.duration })
        },
        { once: true },
      )
      probe.addEventListener(
        'error',
        () => {
          cleanup()
          reject(new Error('video decode error'))
        },
        { once: true },
      )
      probe.src = url
      probe.load()
    })

    if (!metadata.width || !metadata.height || !Number.isFinite(metadata.duration) || metadata.duration <= 0) {
      URL.revokeObjectURL(url)
      return null
    }

    return { url, ...metadata, bytes, label: parts.join(' + ') }
  } catch (error) {
    console.warn('Fonte HQ Triunfante descartada:', parts, error)
    return null
  }
}

export function ScrollTriunfanteBackdrop() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const fallback = fallbackRef.current
    if (!video || !fallback) return

    let cancelled = false
    let pauseTimer = 0
    let motionRaf = 0
    let currentAngle = 0
    let targetAngle = 0
    let hqReady = false
    let fallbackUrl = ''
    const candidateUrls: string[] = []
    const lastScrollByElement = new WeakMap<Element, number>()
    let lastDocumentScroll = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)

    const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor

    const setMotionTransform = (angle: number) => {
      const transform = `perspective(1500px) rotateX(-3deg) rotateY(${angle.toFixed(3)}deg) translateZ(0)`
      ;[video, fallback].forEach((element) => {
        element.style.transform = transform
        element.style.transformOrigin = '50% 50%'
        element.style.backfaceVisibility = 'visible'
        element.style.willChange = 'transform'
      })
    }

    const animateMotion = () => {
      motionRaf = 0
      if (cancelled) return
      const distance = targetAngle - currentAngle
      currentAngle += distance * MOTION_EASING
      if (Math.abs(distance) < 0.02) currentAngle = targetAngle
      setMotionTransform(currentAngle)
      if (Math.abs(targetAngle - currentAngle) > 0.02) {
        motionRaf = window.requestAnimationFrame(animateMotion)
      }
    }

    const addRotation = (delta: number) => {
      if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return
      targetAngle += delta * ROTATION_PER_PIXEL
      if (!motionRaf) motionRaf = window.requestAnimationFrame(animateMotion)
    }

    const paintFallback = () => {
      const scrollTop = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)
      const progress = modulo(scrollTop / PIXELS_PER_LOOP, 1)
      const frame = Math.floor(progress * FALLBACK_FRAME_COUNT) % FALLBACK_FRAME_COUNT
      const column = frame % FALLBACK_COLUMNS
      const row = Math.floor(frame / FALLBACK_COLUMNS)
      fallback.style.backgroundPosition = `${column * 50}% ${row * 100}%`
    }

    const stopPlaybackSoon = () => {
      if (pauseTimer) window.clearTimeout(pauseTimer)
      pauseTimer = window.setTimeout(() => {
        pauseTimer = 0
        if (!cancelled) video.pause()
      }, SCROLL_STOP_DELAY)
    }

    const startPlayback = (intensity = 1) => {
      if (cancelled || !hqReady) {
        paintFallback()
        return
      }
      video.playbackRate = Math.min(2.3, Math.max(0.9, intensity))
      video.play().catch(() => undefined)
      stopPlaybackSoon()
    }

    const reactToDelta = (delta: number) => {
      if (Math.abs(delta) <= 0.05) return
      addRotation(delta)
      if (delta > 0) startPlayback(1 + Math.min(1.2, Math.abs(delta) / 26))
    }

    const onAnyScroll = (event: Event) => {
      paintFallback()
      const target = event.target
      if (target instanceof Element) {
        const current = target.scrollTop
        const previous = lastScrollByElement.get(target) ?? current
        lastScrollByElement.set(target, current)
        reactToDelta(current - previous)
        return
      }
      const current = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)
      const delta = current - lastDocumentScroll
      lastDocumentScroll = current
      reactToDelta(delta)
    }

    const onWindowScroll = () => {
      paintFallback()
      const current = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)
      const delta = current - lastDocumentScroll
      lastDocumentScroll = current
      reactToDelta(delta)
    }

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= 0.05) return
      addRotation(event.deltaY * 0.16)
      if (event.deltaY > 0) startPlayback(1 + Math.min(1.2, Math.abs(event.deltaY) / 140))
    }

    setMotionTransform(0)
    paintFallback()
    document.addEventListener('scroll', onAnyScroll, true)
    window.addEventListener('scroll', onWindowScroll, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('resize', paintFallback, { passive: true })

    ;(async () => {
      try {
        const fallbackText = await fetchText(FALLBACK_PART)
        if (!cancelled) {
          fallbackUrl = base64ToObjectUrl(fallbackText, 'image/webp').url
          fallback.style.backgroundImage = `url("${fallbackUrl}")`
          fallback.style.opacity = '1'
        }
      } catch (error) {
        console.warn('Fallback Triunfante indisponível:', error)
      }

      const results = await Promise.all(HQ_CANDIDATES.map(buildCandidate))
      if (cancelled) {
        results.forEach((candidate) => candidate && URL.revokeObjectURL(candidate.url))
        return
      }

      const valid = results.filter((candidate): candidate is VideoCandidate => Boolean(candidate))
      candidateUrls.push(...valid.map((candidate) => candidate.url))
      valid.sort((a, b) => b.width * b.height - a.width * a.height || b.bytes - a.bytes)

      const best = valid[0]
      if (!best) return

      video.src = best.url
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.loop = true
      video.playbackRate = 1

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('HQ video load timeout')), 7000)
        const cleanup = () => window.clearTimeout(timeout)
        video.addEventListener('loadeddata', () => { cleanup(); resolve() }, { once: true })
        video.addEventListener('error', () => { cleanup(); reject(new Error('HQ video load error')) }, { once: true })
        video.load()
      })

      if (cancelled) return
      hqReady = true
      video.pause()
      video.style.opacity = '1'
      fallback.style.opacity = '0'
      setMotionTransform(currentAngle)
    })().catch((error) => console.warn('Falha ao iniciar Triunfante HQ:', error))

    return () => {
      cancelled = true
      document.removeEventListener('scroll', onAnyScroll, true)
      window.removeEventListener('scroll', onWindowScroll)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', paintFallback)
      if (pauseTimer) window.clearTimeout(pauseTimer)
      if (motionRaf) window.cancelAnimationFrame(motionRaf)
      video.pause()
      video.removeAttribute('src')
      candidateUrls.forEach((url) => URL.revokeObjectURL(url))
      if (fallbackUrl) URL.revokeObjectURL(fallbackUrl)
    }
  }, [])

  return (
    <div className="triunfante-scroll-backdrop" aria-hidden="true">
      <div ref={fallbackRef} className="triunfante-hq-fallback" />
      <video ref={videoRef} className="triunfante-hq-video" muted playsInline loop preload="auto" />
    </div>
  )
}
