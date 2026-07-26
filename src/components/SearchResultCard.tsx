import { formatDuration } from '../lib/formatting'
import type { SearchCandidate } from '../types/music'

interface SearchResultCardProps {
  candidate: SearchCandidate
  onSelect: (candidate: SearchCandidate) => void
}

export function SearchResultCard({ candidate, onSelect }: SearchResultCardProps) {
  return (
    <article className="search-card">
      <div className="search-card-media">
        {candidate.thumbnail ? (
          <img src={candidate.thumbnail} alt="" width={120} height={68} loading="lazy" />
        ) : (
          <div className="thumb-fallback" aria-hidden="true" />
        )}
      </div>
      <div className="search-card-body">
        <h3 className="search-card-title">{candidate.title}</h3>
        <p className="search-card-meta">
          {candidate.uploader ?? 'Unknown uploader'} · {formatDuration(candidate.duration)}
        </p>
        <p className="search-card-source">{candidate.source}</p>
        <div className="search-card-actions">
          <a href={candidate.webpageUrl} target="_blank" rel="noreferrer noopener">
            Open source
          </a>
          <button type="button" className="primary-btn" onClick={() => onSelect(candidate)}>
            Select and import
          </button>
        </div>
      </div>
    </article>
  )
}
