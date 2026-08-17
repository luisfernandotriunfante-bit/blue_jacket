import { useEffect, useRef } from 'react'

const FRAME_COUNT = 72;
const PIXELS_PER_FRAME = 30; // Controla a velocidade da animação baseada no scroll

export function ScrollTriunfanteBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cancelled = false
    let currentFrameIndex = -1
    let scrollPosition = 0
    let targetScrollPosition = 0
    let rafId = 0
    let images: HTMLImageElement[] = []
    
    // Trackers para scroll global
    let lastDocumentScroll = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)
    const lastScrollByElement = new WeakMap<Element, number>()

    const loadImages = () => {
      for (let i = 0; i < FRAME_COUNT; i++) {
        const img = new Image()
        const indexStr = i.toString().padStart(3, '0')
        img.src = `/triunfante_frames/frame_${indexStr}.png`
        
        img.onload = () => {
          if (cancelled) return
          // Se for o primeiro frame e ainda não tivermos renderizado, renderiza
          if (i === 0 && currentFrameIndex === -1) {
            renderFrame(0)
          }
        }
        images.push(img)
      }
    }

    const renderFrame = (index: number) => {
      if (cancelled || !canvas || !ctx) return
      
      let safeIndex = ((index % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT
      
      // Mágica para fazer a logo ter dois lados: 
      // Mapeamos a metade de trás (frames 19 a 54) para a metade da frente equivalente (+180 graus)
      if (safeIndex > 18 && safeIndex <= 54) {
        safeIndex = (safeIndex + 36) % FRAME_COUNT
      }

      if (safeIndex === currentFrameIndex) return

      const img = images[safeIndex]
      if (img && img.complete && img.naturalWidth > 0) {
        // Ajusta as dimensões do canvas à imagem real, mas o CSS controla o tamanho visível
        if (canvas.width !== img.width || canvas.height !== img.height) {
            canvas.width = img.width
            canvas.height = img.height
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        currentFrameIndex = safeIndex
      }
    }

    const animateScroll = () => {
      if (cancelled) return
      
      const diff = targetScrollPosition - scrollPosition
      if (Math.abs(diff) > 0.5) {
        scrollPosition += diff * 0.18 // Suavidade da interpolação
        
        const progress = scrollPosition / (FRAME_COUNT * PIXELS_PER_FRAME)
        const frameProgress = ((progress % 1) + 1) % 1
        const frameIndex = Math.floor(frameProgress * FRAME_COUNT)
        
        renderFrame(frameIndex)
        rafId = window.requestAnimationFrame(animateScroll)
      } else {
        rafId = 0
      }
    }

    const addScrollDelta = (delta: number) => {
        if (Math.abs(delta) <= 0) return
        targetScrollPosition += delta
        if (!rafId) {
            rafId = window.requestAnimationFrame(animateScroll)
        }
    }

    const onAnyScroll = (event: Event) => {
      const target = event.target
      if (target instanceof Element) {
        const current = target.scrollTop
        const previous = lastScrollByElement.get(target) ?? current
        lastScrollByElement.set(target, current)
        addScrollDelta(current - previous)
        return
      }
      const current = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)
      const delta = current - lastDocumentScroll
      lastDocumentScroll = current
      addScrollDelta(delta)
    }

    const onWindowScroll = () => {
      const current = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)
      const delta = current - lastDocumentScroll
      lastDocumentScroll = current
      addScrollDelta(delta)
    }

    const onWheel = (event: WheelEvent) => {
      addScrollDelta(event.deltaY)
    }

    loadImages()
    document.addEventListener('scroll', onAnyScroll, true)
    window.addEventListener('scroll', onWindowScroll, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      cancelled = true
      document.removeEventListener('scroll', onAnyScroll, true)
      window.removeEventListener('scroll', onWindowScroll)
      window.removeEventListener('wheel', onWheel)
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div className="triunfante-scroll-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="triunfante-canvas" />
    </div>
  )
}
