'use client'

import { useState, useCallback } from 'react'

const FACTS = [
  "The word \"manga\" (漫画) was coined by artist Hokusai in 1814 — it literally means \"whimsical pictures\".",
  "One Piece holds the Guinness World Record for the most copies published for a single comic book series by one author: over 500 million copies worldwide.",
  "Osamu Tezuka, often called the \"God of Manga\", produced an estimated 150,000 pages of manga during his lifetime.",
  "The first manga magazine, Eshinbun Nipponchi, was published in 1874 — over 150 years ago.",
  "Manga is read right-to-left because Japanese is traditionally written that way; the format was kept even as manga went global.",
  "Dragon Ball's Goku was originally inspired by the Monkey King from the Chinese classic Journey to the West.",
  "Berserk's author Kentaro Miura reportedly spent up to a year drawing a single chapter during peak detail periods.",
  "Shonen Jump was launched in 1968 and has been a weekly publication almost without interruption ever since.",
  "The \"big three\" of Shonen Jump's golden era — Naruto, Bleach, and One Piece — ran concurrently for over a decade.",
  "Attack on Titan's Hajime Isayama drew the first chapter as a university student and it was rejected by several publishers before Kodansha accepted it.",
  "Fullmetal Alchemist was written entirely by Hiromu Arakawa, a woman — unusual for the shōnen demographic it targets.",
  "Tokyo Ghoul's author Sui Ishida worked as an anonymous web cartoonist before being scouted by Weekly Young Jump.",
  "The average weekly Shonen Jump chapter is 19 pages. Artists typically have only one assistant (or none) to meet that deadline.",
  "Death Note's plot was originally conceived in a single week by writer Tsugumi Ohba.",
  "Vinland Saga is set in 11th-century Europe and features real historical figures including King Cnut of England.",
  "Jojo's Bizarre Adventure has been running since 1987 — making it one of the longest-running manga still in publication.",
  "Katsuhiro Otomo's Akira (1982) was the first manga to be published in full colour in the USA.",
  "The mangaka Inio Asano (Goodnight Punpun) photographs real Tokyo locations and traces them as backgrounds.",
  "Chainsaw Man was rejected by multiple editors before being accepted — the original pitch had a very different tone.",
  "Hunter x Hunter's Yoshihiro Togashi holds the record for the most hiatuses of any major ongoing manga — over 3 years cumulatively.",
  "Doraemon, the robotic cat manga, has sold over 250 million copies and is one of Japan's most recognised cultural exports.",
  "The term \"tankōbon\" refers to a standalone manga volume — fans often wait for these instead of reading weekly to avoid cliffhangers.",
  "Rumiko Takahashi (Inuyasha, Ranma ½, Urusei Yatsura) is one of the best-selling female comic artists in history.",
  "Slam Dunk is credited with a massive surge in basketball participation in Japan during the 1990s.",
  "Most professional mangaka work on less than 5 hours of sleep per night during serialisation.",
  "The mangaka behind My Hero Academia, Kōhei Horikoshi, cited American superhero comics as his primary inspiration.",
  "Naoki Urasawa (Monster, 20th Century Boys) writes scripts in full prose before drawing a single panel.",
  "Weekly Shonen Jump's editors can — and do — cancel manga that underperform in reader surveys with just a few weeks notice.",
  "The term \"scanlation\" (scan + translation) describes fan-translated manga — the practice predates digital manga distribution by over a decade.",
  "Manga accounts for roughly 40% of all printed material sold in Japan.",
]

function pickRandom(exclude: number, length: number): number {
  let next = Math.floor(Math.random() * length)
  while (next === exclude && length > 1) next = Math.floor(Math.random() * length)
  return next
}

export default function MangaFact() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * FACTS.length))
  const [animating, setAnimating] = useState(false)

  const refresh = useCallback(() => {
    if (animating) return
    setAnimating(true)
    setTimeout(() => {
      setIndex(i => pickRandom(i, FACTS.length))
      setAnimating(false)
    }, 180)
  }, [animating])

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 mb-5 flex items-start gap-3 group">
      <span className="text-lg shrink-0 mt-0.5">📖</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-1">Did you know?</p>
        <p
          className="text-xs text-zinc-300 leading-relaxed transition-opacity duration-200"
          style={{ opacity: animating ? 0 : 1 }}
        >
          {FACTS[index]}
        </p>
      </div>
      <button
        onClick={refresh}
        aria-label="Show another fact"
        className="shrink-0 mt-0.5 text-zinc-600 hover:text-zinc-300 transition-colors text-sm select-none"
        title="Another fact"
      >
        ↻
      </button>
    </div>
  )
}
