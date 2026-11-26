"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations, type Messages } from "next-intl";

// Keys into messages/<locale>.json's `home.quiz`, not prose: the quiz is
// reader-facing copy. The SCORE keys are region names and stay as they are
// -- they are the scoring vocabulary and the lookup key into
// DESTINATION_INFO, never shown to anyone directly (the winning region is
// rendered through its own `destinations` message key -- see DESTINATION_INFO).
// Keys drawn from the message file's own shape (i18n/global.d.ts types
// `Messages` off messages/en.json), so a key that does not exist -- or one
// deleted from the messages later -- fails `npm run typecheck` rather than
// rendering as raw text at runtime.
type QuizMessages = Messages["home"]["quiz"];
type Answer = {
  labelKey: keyof QuizMessages["answers"];
  scores: Record<string, number>;
};
type Question = {
  promptKey: keyof QuizMessages["questions"];
  answers: Answer[];
};

// Deliberately hardcoded -- a fixed, fun scoring quiz, not a real
// recommendation engine. Does not read from Supabase or compare against
// any published story/region data; the destinations named here don't need
// to match whatever regions currently exist in the catalogue.
const QUESTIONS: Question[] = [
  {
    promptKey: "home",
    answers: [
      { labelKey: "livelyCity", scores: { Auckland: 3, Wellington: 3 } },
      { labelKey: "coastalTown", scores: { "Bay of Plenty": 4 } },
      {
        labelKey: "mountains",
        scores: { "Queenstown Lakes": 5, "Central Otago": 2 },
      },
      { labelKey: "countryside", scores: { Canterbury: 5 } },
      {
        labelKey: "seasonalCommunity",
        scores: { "Bay of Plenty": 3, "Central Otago": 3 },
      },
    ],
  },
  {
    promptKey: "job",
    answers: [
      {
        labelKey: "hospitality",
        scores: { Wellington: 4, Auckland: 3 },
      },
      { labelKey: "fruitPicking", scores: { "Bay of Plenty": 5 } },
      { labelKey: "farmWork", scores: { Canterbury: 5 } },
      { labelKey: "skiField", scores: { "Queenstown Lakes": 6 } },
      { labelKey: "vineyard", scores: { "Central Otago": 6 } },
    ],
  },
  {
    promptKey: "matters",
    answers: [
      {
        labelKey: "savingMoney",
        scores: { "Bay of Plenty": 4, Canterbury: 2 },
      },
      {
        labelKey: "meetingPeople",
        scores: { Auckland: 3, "Queenstown Lakes": 3 },
      },
      {
        labelKey: "timeOutdoors",
        scores: { Canterbury: 3, "Queenstown Lakes": 4 },
      },
      {
        labelKey: "usefulExperience",
        scores: { Auckland: 3, Wellington: 3 },
      },
      {
        labelKey: "workTravelBalance",
        scores: { Wellington: 3, "Central Otago": 3 },
      },
    ],
  },
  {
    promptKey: "pace",
    answers: [
      {
        labelKey: "busySocial",
        scores: { Auckland: 4, "Queenstown Lakes": 3 },
      },
      {
        labelKey: "relaxedScenic",
        scores: { "Bay of Plenty": 3, "Central Otago": 4 },
      },
      {
        labelKey: "activePhysical",
        scores: { Canterbury: 3, "Queenstown Lakes": 4 },
      },
      {
        labelKey: "independentFlexible",
        scores: { Canterbury: 2, "Central Otago": 3 },
      },
    ],
  },
  {
    promptKey: "season",
    answers: [
      { labelKey: "summer", scores: { Auckland: 2, "Bay of Plenty": 3 } },
      {
        labelKey: "autumn",
        scores: { "Central Otago": 5, "Bay of Plenty": 3 },
      },
      { labelKey: "winter", scores: { "Queenstown Lakes": 6 } },
      { labelKey: "spring", scores: { Canterbury: 4, Wellington: 2 } },
      {
        labelKey: "flexible",
        scores: {
          Auckland: 1,
          Wellington: 1,
          Canterbury: 1,
          "Bay of Plenty": 1,
          "Queenstown Lakes": 1,
          "Central Otago": 1,
        },
      },
    ],
  },
];

// Message keys again, plus a `nameKey` into the quiz's own `destinations`
// namespace (messages/<locale>.json, home.quiz.destinations) so the heading
// is translated without touching the database's regions table -- this
// quiz's scoring vocabulary is its own fixed set (see the note above
// QUESTIONS), not the catalogue's, and "Queenstown Lakes" / "Central Otago"
// are not real region rows there. The record's own keys are the scoring
// names used by the answers above.
const DESTINATION_INFO: Record<
  string,
  {
    nameKey: keyof QuizMessages["destinations"];
    seasonKey: keyof QuizMessages["seasons"];
    workKey: keyof QuizMessages["info"];
    noteKey: keyof QuizMessages["info"];
  }
> = {
  Auckland: {
    nameKey: "auckland",
    seasonKey: "yearRound",
    workKey: "aucklandWork",
    noteKey: "aucklandNote",
  },
  Wellington: {
    nameKey: "wellington",
    seasonKey: "spring",
    workKey: "wellingtonWork",
    noteKey: "wellingtonNote",
  },
  Canterbury: {
    nameKey: "canterbury",
    seasonKey: "spring",
    workKey: "canterburyWork",
    noteKey: "canterburyNote",
  },
  "Bay of Plenty": {
    nameKey: "bayOfPlenty",
    seasonKey: "autumn",
    workKey: "bayOfPlentyWork",
    noteKey: "bayOfPlentyNote",
  },
  "Queenstown Lakes": {
    nameKey: "queenstownLakes",
    seasonKey: "winter",
    workKey: "queenstownWork",
    noteKey: "queenstownNote",
  },
  "Central Otago": {
    nameKey: "centralOtago",
    seasonKey: "autumn",
    workKey: "centralOtagoWork",
    noteKey: "centralOtagoNote",
  },
};

const DEFAULT_DESTINATION = "Auckland";

// ---------------------------------------------------------------------------
// Malaysia (2026-11-26): the same fun scoring quiz, general-travel framed
// (never WHV). Its copy lives in home.quizMalaysia; the shared chrome
// (progress, back, try again) stays in home.quiz. Scoring names are again
// its own fixed vocabulary, not database regions.
// ---------------------------------------------------------------------------
type MalaysiaQuizMessages = Messages["home"]["quizMalaysia"];
type MalaysiaQuestion = {
  promptKey: keyof MalaysiaQuizMessages["questions"];
  answers: {
    labelKey: keyof MalaysiaQuizMessages["answers"];
    scores: Record<string, number>;
  }[];
};

export const MALAYSIA_QUESTIONS: MalaysiaQuestion[] = [
  {
    promptKey: "home",
    answers: [
      { labelKey: "bigCity", scores: { KualaLumpur: 5 } },
      { labelKey: "heritageTown", scores: { Melaka: 4, Penang: 3 } },
      { labelKey: "islandBeach", scores: { Langkawi: 5, Sabah: 2 } },
      { labelKey: "coolHighlands", scores: { CameronHighlands: 6 } },
      { labelKey: "rainforest", scores: { Sabah: 5 } },
    ],
  },
  {
    promptKey: "doing",
    answers: [
      { labelKey: "streetFood", scores: { Penang: 5, KualaLumpur: 2 } },
      { labelKey: "diving", scores: { Sabah: 5, Langkawi: 2 } },
      { labelKey: "hiking", scores: { CameronHighlands: 4, Sabah: 3 } },
      { labelKey: "cafesWalks", scores: { Melaka: 4, Penang: 3 } },
      { labelKey: "shoppingNightlife", scores: { KualaLumpur: 5 } },
    ],
  },
  {
    promptKey: "matters",
    answers: [
      { labelKey: "budget", scores: { Penang: 3, Melaka: 3 } },
      { labelKey: "meetingPeople", scores: { KualaLumpur: 4, Langkawi: 2 } },
      { labelKey: "timeOutdoors", scores: { Sabah: 4, CameronHighlands: 3 } },
      { labelKey: "cultureHistory", scores: { Melaka: 5, Penang: 3 } },
      { labelKey: "slowRest", scores: { Langkawi: 4, CameronHighlands: 3 } },
    ],
  },
  {
    promptKey: "pace",
    answers: [
      { labelKey: "busySocial", scores: { KualaLumpur: 4, Penang: 2 } },
      {
        labelKey: "relaxedScenic",
        scores: { Langkawi: 4, CameronHighlands: 3 },
      },
      { labelKey: "activePhysical", scores: { Sabah: 5 } },
      { labelKey: "independentFlexible", scores: { Penang: 3, Melaka: 3 } },
    ],
  },
  {
    promptKey: "timing",
    answers: [
      { labelKey: "marToOct", scores: { Sabah: 3, KualaLumpur: 1 } },
      { labelKey: "novToFeb", scores: { Langkawi: 3, Penang: 3 } },
      {
        labelKey: "festiveSeason",
        scores: { Penang: 3, KualaLumpur: 3, Melaka: 2 },
      },
      {
        labelKey: "flexible",
        scores: {
          KualaLumpur: 1,
          Penang: 1,
          Melaka: 1,
          Langkawi: 1,
          CameronHighlands: 1,
          Sabah: 1,
        },
      },
    ],
  },
];

export const MALAYSIA_DESTINATION_INFO: Record<
  string,
  {
    nameKey: keyof MalaysiaQuizMessages["destinations"];
    seasonKey: keyof MalaysiaQuizMessages["seasons"];
    workKey: keyof MalaysiaQuizMessages["info"];
    noteKey: keyof MalaysiaQuizMessages["info"];
  }
> = {
  KualaLumpur: {
    nameKey: "kualaLumpur",
    seasonKey: "yearRound",
    workKey: "kualaLumpurKnownFor",
    noteKey: "kualaLumpurNote",
  },
  Penang: {
    nameKey: "penang",
    seasonKey: "decToApr",
    workKey: "penangKnownFor",
    noteKey: "penangNote",
  },
  Melaka: {
    nameKey: "melaka",
    seasonKey: "yearRound",
    workKey: "melakaKnownFor",
    noteKey: "melakaNote",
  },
  Langkawi: {
    nameKey: "langkawi",
    seasonKey: "novToApr",
    workKey: "langkawiKnownFor",
    noteKey: "langkawiNote",
  },
  CameronHighlands: {
    nameKey: "cameronHighlands",
    seasonKey: "yearRound",
    workKey: "cameronHighlandsKnownFor",
    noteKey: "cameronHighlandsNote",
  },
  Sabah: {
    nameKey: "sabah",
    seasonKey: "marToSep",
    workKey: "sabahKnownFor",
    noteKey: "sabahNote",
  },
};

type QuizVariant = "new-zealand" | "malaysia";

/** One shape for both quizzes; keys are checked by their typed tables above. */
type LooseQuestion = {
  promptKey: string;
  answers: { labelKey: string; scores: Record<string, number> }[];
};
type LooseInfo = Record<
  string,
  { nameKey: string; seasonKey: string; workKey: string; noteKey: string }
>;

const VARIANTS: Record<
  QuizVariant,
  {
    questions: LooseQuestion[];
    info: LooseInfo;
    fallback: string;
    contentNamespace: "home.quiz" | "home.quizMalaysia";
  }
> = {
  "new-zealand": {
    questions: QUESTIONS,
    info: DESTINATION_INFO,
    fallback: DEFAULT_DESTINATION,
    contentNamespace: "home.quiz",
  },
  malaysia: {
    questions: MALAYSIA_QUESTIONS,
    info: MALAYSIA_DESTINATION_INFO,
    fallback: "KualaLumpur",
    contentNamespace: "home.quizMalaysia",
  },
};

export function DestinationQuiz({
  country = "new-zealand",
  exploreHref = "/stories",
}: {
  /** Which country's quiz. New Zealand's is the original WHV one. */
  country?: QuizVariant;
  /** Where "Explore stories" goes: that country's Stories tab. */
  exploreHref?: string;
} = {}) {
  const t = useTranslations("home.quiz");
  const variant = VARIANTS[country];
  // The content namespace differs per country; its keys are pinned by the
  // typed tables above and by destination-quiz.test.tsx, so a loose lookup
  // here cannot drift silently.
  const tc = useTranslations(variant.contentNamespace) as unknown as (
    key: string,
  ) => string;
  const QUESTIONS_ = variant.questions;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);

  const isResult = step === QUESTIONS_.length;
  const progress = Math.round(
    ((isResult ? QUESTIONS_.length : step + 1) / QUESTIONS_.length) * 100,
  );

  function choose(answerIndex: number) {
    const next = [...answers];
    next[step] = answerIndex;
    setAnswers(next);
    setStep((current) => current + 1);
  }

  function restart() {
    setAnswers([]);
    setStep(0);
  }

  function computeDestination(): string {
    const totals: Record<string, number> = {};
    answers.forEach((answerIndex, questionIndex) => {
      if (answerIndex === undefined) return;
      const scores = QUESTIONS_[questionIndex].answers[answerIndex].scores;
      for (const [destination, points] of Object.entries(scores)) {
        totals[destination] = (totals[destination] ?? 0) + points;
      }
    });
    const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    return ranked[0]?.[0] ?? variant.fallback;
  }

  const destination = isResult ? computeDestination() : null;
  const facts = destination ? variant.info[destination] : null;
  const destinationLabel = facts
    ? tc(`destinations.${facts.nameKey}`)
    : destination;
  const isMalaysia = country === "malaysia";

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-border-subtle">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm font-medium text-foreground/60">
          {isResult
            ? t("yourMatch")
            : t("progress", { step: step + 1, total: QUESTIONS_.length })}
        </span>
      </div>

      {!isResult ? (
        <div>
          <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {tc(`questions.${QUESTIONS_[step].promptKey}`)}
          </h3>
          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {QUESTIONS_[step].answers.map((answer, index) => (
              <button
                key={answer.labelKey}
                type="button"
                data-testid="quiz-answer"
                onClick={() => choose(index)}
                className="min-h-[72px] rounded-xl border border-border-subtle bg-surface p-4 text-left font-medium shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-accent hover:shadow-md dark:bg-surface-muted dark:shadow-none dark:hover:bg-surface"
              >
                {tc(`answers.${answer.labelKey}`)}
              </button>
            ))}
          </div>
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((current) => current - 1)}
              className="mt-5 text-sm font-medium hover:underline"
            >
              {t("back")}
            </button>
          ) : null}
        </div>
      ) : (
        <div>
          <span className="text-xs font-semibold tracking-wide text-accent uppercase">
            {tc("resultKicker")}
          </span>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {destinationLabel}
          </h3>
          {facts ? (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-surface-muted p-3">
                <span className="block text-xs text-foreground/60">
                  {isMalaysia ? tc("bestTime") : t("bestSeason")}
                </span>
                <strong className="text-sm">
                  {tc(`seasons.${facts.seasonKey}`)}
                </strong>
              </div>
              <div className="rounded-lg bg-surface-muted p-3">
                <span className="block text-xs text-foreground/60">
                  {isMalaysia ? tc("knownFor") : t("work")}
                </span>
                <strong className="text-sm">
                  {tc(`info.${facts.workKey}`)}
                </strong>
              </div>
              <div className="rounded-lg bg-surface-muted p-3">
                <span className="block text-xs text-foreground/60">
                  {t("practicalNote")}
                </span>
                <strong className="text-sm">
                  {tc(`info.${facts.noteKey}`)}
                </strong>
              </div>
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={exploreHref}
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              {t("exploreStories")}
            </Link>
            <button
              type="button"
              onClick={restart}
              className="rounded-md border border-border-subtle px-5 py-2.5 text-sm font-medium hover:bg-surface-muted"
            >
              {t("tryAgain")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
