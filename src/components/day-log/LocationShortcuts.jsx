// @ts-check
import './location-shortcuts.css'

/**
 * @param {Object} props
 * @param {Array<string>} props.locations
 * @param {Array<string>} props.pinnedLocations
 * @param {(location: string) => void} props.onSelect
 * @param {(location: string) => void} props.onTogglePin
 */
export default function LocationShortcuts({ locations, pinnedLocations, onSelect, onTogglePin }) {
  if (!locations.length) return null
  const pinned = new Set(pinnedLocations)

  return (
    <div className="location-shortcuts">
      {locations.map((location) => {
        const isPinned = pinned.has(location)
        return (
          <span key={location} className={`location-chip${isPinned ? ' pinned' : ''}`}>
            <button type="button" className="location-chip-select" onClick={() => onSelect(location)}>
              {location}
            </button>
            <button
              type="button"
              className="location-chip-pin"
              title={isPinned ? '고정 해제' : '장소 고정'}
              aria-label={`${location} ${isPinned ? '고정 해제' : '장소 고정'}`}
              onClick={() => onTogglePin(location)}
            >
              {isPinned ? '★' : '☆'}
            </button>
          </span>
        )
      })}
    </div>
  )
}
