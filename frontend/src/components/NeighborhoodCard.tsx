import './NeighborhoodCard.css'

function hashString(input: string): number {
  // Deterministic, fast, non-crypto hash (FNV-1a-ish).
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pickFrom<T>(items: T[], seed: number): T {
  const idx = items.length > 0 ? seed % items.length : 0
  return items[idx]
}

export type NeighborhoodCardContent = {
  neighborhoodName: string
  description: string
  hiddenGemName: string
  hiddenGemDescription: string
  hiddenGemMapsUrl: string
}

export function buildNeighborhoodCardContent(
  neighborhoodName: string,
): NeighborhoodCardContent {
  const seed = hashString(neighborhoodName.trim().toLowerCase())

  const vibes = [
    'front-porch friendly',
    'late-night alive',
    'lake-breeze calm',
    'block-party ready',
    'quietly iconic',
    'always in motion',
    'old-school with new energy',
    'built on grit and pride',
  ]
  const staples = [
    'corner stores and familiar faces',
    'big skies over wide streets',
    'backyards, barbecues, and bikes',
    'front stoops and bus stops',
    'parks that fill up fast on the first warm day',
    'a mix of longtime roots and new chapters',
    'weekend errands that turn into hangouts',
    'neighbors who wave even when they’re in a hurry',
  ]
  const gems = [
    'Coffee & Conchas',
    'The Vinyl Corner',
    'Lakeview Lookout',
    'Dumpling House',
    'The Pocket Garden',
    'Corner Book Nook',
    'Midnight Pho',
    'The Brick Oven Slice',
    'Elote on the Go',
    'The Small Museum',
    'The Quiet Taproom',
    'The Train-Stop Bakery',
  ]
  const gemDetails = [
    'A low-key stop that feels like a reward for getting off the main drag.',
    'A place where you can linger, people-watch, and leave with something new.',
    'Small, local, and easy to love—perfect for a quick detour.',
    'The kind of spot you tell a friend about and then immediately regret sharing.',
    'Unpretentious, neighborly, and exactly what you want on a random weekday.',
    'A little pocket of comfort that makes the block feel like home.',
  ]

  const vibe = pickFrom(vibes, seed)
  const staple = pickFrom(staples, seed >>> 3)
  const hiddenGemName = pickFrom(gems, seed >>> 7)
  const hiddenGemDescription = pickFrom(gemDetails, seed >>> 11)
  const description = `${neighborhoodName} is ${vibe}—a place of ${staple}.`

  const query = encodeURIComponent(`${hiddenGemName} Chicago`)
  const hiddenGemMapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`

  return {
    neighborhoodName,
    description,
    hiddenGemName,
    hiddenGemDescription,
    hiddenGemMapsUrl,
  }
}

export function NeighborhoodCard(props: {
  neighborhoodName: string | null
  variant?: 'panel' | 'sheet'
}) {
  const { neighborhoodName, variant = 'panel' } = props

  if (!neighborhoodName) {
    return (
      <section className={`neighborhood-card neighborhood-card--${variant}`}>
        <header className="neighborhood-card__header">
          <p className="neighborhood-card__kicker">Neighborhood</p>
          <h2 className="neighborhood-card__title">Tap a piece</h2>
        </header>
        <p className="neighborhood-card__body">
          Tap a neighborhood on the map to see a quick description and a “hidden gem”
          suggestion.
        </p>
      </section>
    )
  }

  const content = buildNeighborhoodCardContent(neighborhoodName)

  return (
    <section className={`neighborhood-card neighborhood-card--${variant}`}>
      <header className="neighborhood-card__header">
        <p className="neighborhood-card__kicker">Neighborhood</p>
        <h2 className="neighborhood-card__title">{content.neighborhoodName}</h2>
      </header>

      <p className="neighborhood-card__body">{content.description}</p>

      <div className="neighborhood-card__divider" role="presentation" />

      <div className="neighborhood-card__gem">
        <p className="neighborhood-card__gem-kicker">Hidden gem</p>
        <a
          className="neighborhood-card__gem-link"
          href={content.hiddenGemMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {content.hiddenGemName}
        </a>
        <p className="neighborhood-card__gem-body">{content.hiddenGemDescription}</p>
      </div>
    </section>
  )
}

