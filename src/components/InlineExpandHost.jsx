import { useEffect, useRef, useState } from 'react'

const CLOSE_MS = 480

export default function InlineExpandHost({ open, className, children }) {
  const hostRef = useRef(null)
  const innerRef = useRef(null)
  const childrenRef = useRef(children)
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  if (open) childrenRef.current = children

  function syncHeight() {
    const host = hostRef.current
    const inner = innerRef.current
    if (!host || !inner) return
    host.style.maxHeight = `${Math.ceil(inner.scrollHeight) + 4}px`
  }

  useEffect(() => {
    if (open) {
      setMounted(true)
      const frame = requestAnimationFrame(() => {
        setVisible(true)
        syncHeight()
        window.setTimeout(() => {
          syncHeight()
          innerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }, 80)
      })
      return () => cancelAnimationFrame(frame)
    }

    setVisible(false)
    if (hostRef.current) hostRef.current.style.maxHeight = '0px'
    const timer = window.setTimeout(() => setMounted(false), CLOSE_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open || !mounted || !innerRef.current) return
    const inner = innerRef.current
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      if (hostRef.current?.classList.contains('is-open')) syncHeight()
    })
    observer.observe(inner)
    return () => observer.disconnect()
  }, [open, mounted, children])

  return (
    <div
      ref={hostRef}
      className={`${className}${open || visible ? ' is-open' : ''}`}
      aria-hidden={!open}
    >
      {mounted && (
        <div ref={innerRef} className={`inline-expanded-panel${visible ? ' is-visible' : ''}`}>
          {childrenRef.current}
        </div>
      )}
    </div>
  )
}
