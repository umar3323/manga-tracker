export interface AnimeEntry {
  title: string
  currentEp: string
  season: number | null
  episodeNumber: number | null
  totalWatchHours: number
  lastWatched: string   // ISO date
  isMovie: boolean
  netflixRating: 'up' | 'down' | null
}

export type AnimeStatus = 'active' | 'paused' | 'older' | 'movie'

export function getStatus(entry: AnimeEntry): AnimeStatus {
  if (entry.isMovie) return 'movie'
  const days = (Date.now() - new Date(entry.lastWatched).getTime()) / 86400000
  if (days <= 90)  return 'active'
  if (days <= 365) return 'paused'
  return 'older'
}

export const animeData: AnimeEntry[] = [
  // === ACTIVE (watched in last 90 days) ===
  { title: "Assassination Classroom",           currentEp: "S1 E10",       season: 1, episodeNumber: 10,  totalWatchHours: 3.0,  lastWatched: "2026-06-03", isMovie: false, netflixRating: null },
  { title: "Horimiya",                          currentEp: "E2",           season: null, episodeNumber: 2,   totalWatchHours: 0.4,  lastWatched: "2026-06-02", isMovie: false, netflixRating: null },
  { title: "Shangri-La Frontier",               currentEp: "S2 E9",        season: 2, episodeNumber: 9,   totalWatchHours: 8.2,  lastWatched: "2026-06-02", isMovie: false, netflixRating: null },
  { title: "Hunter x Hunter (2011)",            currentEp: "S5 E76",       season: 5, episodeNumber: 76,  totalWatchHours: 15.3, lastWatched: "2026-05-30", isMovie: false, netflixRating: null },
  { title: "Avatar: The Last Airbender",        currentEp: "Book 3 E16",   season: 3, episodeNumber: 16,  totalWatchHours: 9.2,  lastWatched: "2026-05-24", isMovie: false, netflixRating: null },
  { title: "The Disastrous Life of Saiki K.",   currentEp: "S3 E2",        season: 3, episodeNumber: 2,   totalWatchHours: 30.3, lastWatched: "2026-05-23", isMovie: false, netflixRating: "up" },
  { title: "Kakegurui",                         currentEp: "E12",          season: null, episodeNumber: 12,  totalWatchHours: 1.5,  lastWatched: "2026-05-09", isMovie: false, netflixRating: null },
  { title: "Frieren: Beyond Journey's End",     currentEp: "S1 E28",       season: 1, episodeNumber: 28,  totalWatchHours: 11.6, lastWatched: "2026-04-08", isMovie: false, netflixRating: null },
  { title: "Komi Can't Communicate",            currentEp: "S1 E24",       season: 1, episodeNumber: 24,  totalWatchHours: 11.5, lastWatched: "2026-03-31", isMovie: false, netflixRating: null },
  { title: "Mob Psycho 100",                    currentEp: "S3 E3",        season: 3, episodeNumber: 3,   totalWatchHours: 7.6,  lastWatched: "2026-03-30", isMovie: false, netflixRating: null },
  { title: "WITCH WATCH",                       currentEp: "S1 E1",        season: 1, episodeNumber: 1,   totalWatchHours: 0.3,  lastWatched: "2026-03-28", isMovie: false, netflixRating: null },
  { title: "Hell's Paradise",                   currentEp: "S1 E13",       season: 1, episodeNumber: 13,  totalWatchHours: 1.8,  lastWatched: "2026-03-26", isMovie: false, netflixRating: "down" },
  { title: "Dr.STONE",                          currentEp: "S2 E11",       season: 2, episodeNumber: 11,  totalWatchHours: 6.5,  lastWatched: "2026-03-26", isMovie: false, netflixRating: null },
  { title: "Fate/EXTRA Last Encore",            currentEp: "E1",           season: null, episodeNumber: 1,   totalWatchHours: 0.0,  lastWatched: "2026-03-25", isMovie: false, netflixRating: null },
  { title: "The Rising of the Shield Hero",     currentEp: "S1 E25",       season: 1, episodeNumber: 25,  totalWatchHours: 4.0,  lastWatched: "2026-03-25", isMovie: false, netflixRating: null },
  { title: "Black Clover",                      currentEp: "E164",         season: null, episodeNumber: 164, totalWatchHours: 1.0,  lastWatched: "2026-03-25", isMovie: false, netflixRating: null },
  { title: "One Piece",                         currentEp: "—",            season: null, episodeNumber: null, totalWatchHours: 0.0,  lastWatched: "2026-03-23", isMovie: false, netflixRating: null },
  { title: "Zom 100: Bucket List of the Dead",  currentEp: "S1 E10",       season: 1, episodeNumber: 10,  totalWatchHours: 3.2,  lastWatched: "2026-03-23", isMovie: false, netflixRating: null },

  // === PAUSED (3–12 months ago) ===
  { title: "Blue Box",                          currentEp: "S1 E1",        season: 1, episodeNumber: 1,   totalWatchHours: 0.2,  lastWatched: "2026-02-19", isMovie: false, netflixRating: null },
  { title: "The Summer Hikaru Died",            currentEp: "S1 E2",        season: 1, episodeNumber: 2,   totalWatchHours: 0.4,  lastWatched: "2026-02-19", isMovie: false, netflixRating: null },
  { title: "The Quintessential Quintuplets",    currentEp: "E6",           season: null, episodeNumber: 6,   totalWatchHours: 1.7,  lastWatched: "2026-02-17", isMovie: false, netflixRating: null },
  { title: "Demon Slayer",                      currentEp: "E20",          season: null, episodeNumber: 20,  totalWatchHours: 0.2,  lastWatched: "2026-02-11", isMovie: false, netflixRating: null },
  { title: "Romantic Killer",                   currentEp: "S1 E1",        season: 1, episodeNumber: 1,   totalWatchHours: 0.4,  lastWatched: "2026-02-02", isMovie: false, netflixRating: null },
  { title: "Kamisama Kiss",                     currentEp: "S1 E2",        season: 1, episodeNumber: 2,   totalWatchHours: 0.5,  lastWatched: "2026-01-28", isMovie: false, netflixRating: null },
  { title: "Violet Evergarden",                 currentEp: "S1 E13",       season: 1, episodeNumber: 13,  totalWatchHours: 2.3,  lastWatched: "2026-01-26", isMovie: false, netflixRating: "up" },
  { title: "The Eminence in Shadow",            currentEp: "E2",           season: null, episodeNumber: 2,   totalWatchHours: 0.6,  lastWatched: "2026-01-24", isMovie: false, netflixRating: null },
  { title: "Natsume's Book of Friends",         currentEp: "E8",           season: null, episodeNumber: 8,   totalWatchHours: 1.2,  lastWatched: "2026-01-12", isMovie: false, netflixRating: null },
  { title: "Kaguya-sama: Love Is War",          currentEp: "E3",           season: null, episodeNumber: 3,   totalWatchHours: 0.0,  lastWatched: "2026-01-12", isMovie: false, netflixRating: null },
  { title: "The Disastrous Life of Saiki K.: Reawakened", currentEp: "S1 E6", season: 1, episodeNumber: 6, totalWatchHours: 2.8, lastWatched: "2026-01-11", isMovie: false, netflixRating: null },
  { title: "Little Witch Academia",             currentEp: "S2 E25",       season: 2, episodeNumber: 25,  totalWatchHours: 5.9,  lastWatched: "2026-01-09", isMovie: false, netflixRating: null },
  { title: "EDENS ZERO",                        currentEp: "S1 E25",       season: 1, episodeNumber: 25,  totalWatchHours: 2.8,  lastWatched: "2026-01-09", isMovie: false, netflixRating: null },
  { title: "SPY x FAMILY",                     currentEp: "S2 E35",       season: 2, episodeNumber: 35,  totalWatchHours: 4.9,  lastWatched: "2026-01-07", isMovie: false, netflixRating: "up" },
  { title: "SAKAMOTO DAYS",                     currentEp: "S1 E21",       season: 1, episodeNumber: 21,  totalWatchHours: 6.6,  lastWatched: "2026-01-03", isMovie: false, netflixRating: null },
  { title: "JoJo's Bizarre Adventure",          currentEp: "E2",           season: null, episodeNumber: 2,   totalWatchHours: 0.5,  lastWatched: "2025-12-27", isMovie: false, netflixRating: null },
  { title: "World Trigger",                     currentEp: "S1 E4",        season: 1, episodeNumber: 4,   totalWatchHours: 1.2,  lastWatched: "2025-12-26", isMovie: false, netflixRating: null },
  { title: "Haikyu!!",                          currentEp: "E1",           season: null, episodeNumber: 1,   totalWatchHours: 0.0,  lastWatched: "2025-12-26", isMovie: false, netflixRating: null },
  { title: "The Fragrant Flower Blooms With Dignity", currentEp: "S1 E13", season: 1, episodeNumber: 13, totalWatchHours: 1.2, lastWatched: "2025-12-24", isMovie: false, netflixRating: null },
  { title: "The Way of the Househusband",       currentEp: "S1 E2",        season: 1, episodeNumber: 2,   totalWatchHours: 0.3,  lastWatched: "2025-12-23", isMovie: false, netflixRating: null },
  { title: "Kotaro Lives Alone",                currentEp: "S1 E10",       season: 1, episodeNumber: 10,  totalWatchHours: 0.6,  lastWatched: "2025-12-17", isMovie: false, netflixRating: "up" },
  { title: "Jujutsu Kaisen",                    currentEp: "S1 E15",       season: 1, episodeNumber: 15,  totalWatchHours: 0.1,  lastWatched: "2025-12-15", isMovie: false, netflixRating: null },
  { title: "Delicious in Dungeon",              currentEp: "S1 E24",       season: 1, episodeNumber: 24,  totalWatchHours: 8.4,  lastWatched: "2025-12-11", isMovie: false, netflixRating: "up" },
  { title: "The Apothecary Diaries",            currentEp: "S1 E24",       season: 1, episodeNumber: 24,  totalWatchHours: 3.7,  lastWatched: "2025-12-10", isMovie: false, netflixRating: null },
  { title: "DAN DA DAN",                        currentEp: "S1 E12",       season: 1, episodeNumber: 12,  totalWatchHours: 3.0,  lastWatched: "2025-12-02", isMovie: false, netflixRating: "up" },

  // === OLDER (12+ months ago) ===
  { title: "My Hero Academia",                  currentEp: "S1 E8",        season: 1, episodeNumber: 8,   totalWatchHours: 0.3,  lastWatched: "2024-12-18", isMovie: false, netflixRating: null },
  { title: "Ouran High School Host Club",       currentEp: "S1 E3",        season: 1, episodeNumber: 3,   totalWatchHours: 0.4,  lastWatched: "2024-07-31", isMovie: false, netflixRating: null },
  { title: "Overlord",                          currentEp: "E13",          season: null, episodeNumber: 13,  totalWatchHours: 1.1,  lastWatched: "2024-05-01", isMovie: false, netflixRating: null },
  { title: "Akuma Kun",                         currentEp: "S1 E3",        season: 1, episodeNumber: 3,   totalWatchHours: 0.4,  lastWatched: "2024-05-01", isMovie: false, netflixRating: null },
  { title: "Junji Ito Maniac",                  currentEp: "S1 E5",        season: 1, episodeNumber: 5,   totalWatchHours: 0.7,  lastWatched: "2024-04-30", isMovie: false, netflixRating: null },
  { title: "The Grimm Variations",              currentEp: "S1 E4",        season: 1, episodeNumber: 4,   totalWatchHours: 1.2,  lastWatched: "2024-04-28", isMovie: false, netflixRating: null },
  { title: "BEASTARS",                          currentEp: "—",            season: null, episodeNumber: null, totalWatchHours: 0.0,  lastWatched: "2026-03-08", isMovie: false, netflixRating: null },

  // === MOVIES ===
  { title: "Jujutsu Kaisen 0",                  currentEp: "Movie",        season: null, episodeNumber: null, totalWatchHours: 0.4,  lastWatched: "2025-12-10", isMovie: true,  netflixRating: null },
  { title: "My Neighbor Totoro",                currentEp: "Movie",        season: null, episodeNumber: null, totalWatchHours: 0.6,  lastWatched: "2025-05-16", isMovie: true,  netflixRating: null },
  { title: "Suzume",                            currentEp: "Movie",        season: null, episodeNumber: null, totalWatchHours: 0.8,  lastWatched: "2024-04-30", isMovie: true,  netflixRating: null },
]
