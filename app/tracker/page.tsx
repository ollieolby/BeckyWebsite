import Tracker from './tracker';

export const metadata = { title: 'Track me — Becky' };

// No site header: this one is meant to be held in one hand on a moving boat,
// so it fills the screen and never scrolls.
export default function TrackerPage() {
  return <Tracker />;
}
