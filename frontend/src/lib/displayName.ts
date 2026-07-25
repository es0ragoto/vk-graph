import type { Band } from '../types/graph';

// Band names are often stylized Roman-alphabet names even for Japanese bands (many have
// no distinct native name at all, per name_native being null) - but where one exists, it's
// the more authentic identity, so it's what the graph shows by default. Musicians go the
// other way (their romaji stage name is what they're known by), so there's no equivalent
// helper for them - musician.name is already the right thing to show.
export function bandDisplayName(band: Band): string {
  return band.name_native || band.name;
}
