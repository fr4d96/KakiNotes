"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations, type Messages } from "next-intl";
import { hasVocabOverlay, localizeVocabName } from "@/lib/i18n/vocab";
import { isLocale } from "@/i18n/locales";

// Keys into messages/<locale>.json's `home.quiz`, not prose: the quiz is
// reader-facing copy. The SCORE keys are region names and stay as they are
// -- they are the scoring vocabulary and the lookup key into
// DESTINATION_INFO, never shown to anyone directly (the winning region is
// rendered through the vocab overlay).
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

// Message keys again, plus the region SLUG so the heading can be shown
// through the vocabulary overlay (lib/i18n/vocab.ts). The record's own keys
// are the scoring names used by the answers above.
const DESTINATION_INFO: Record<
  string,
  {
    slug: string;
    seasonKey: keyof QuizMessages["seasons"];
    workKey: keyof QuizMessages["info"];
    noteKey: keyof QuizMessages["info"];
  }
> = {
  Auckland: {
    slug: "auckland",
    seasonKey: "yearRound",
    workKey: "aucklandWork",
    noteKey: "aucklandNote",
  },
  Wellington: {
    slug: "wellington",
    seasonKey: "spring",
    workKey: "wellingtonWork",
    noteKey: "wellingtonNote",
  },
  Canterbury: {
    slug: "canterbury",
    seasonKey: "spring",
    workKey: "canterburyWork",
    noteKey: "canterburyNote",
  },
  "Bay of Plenty": {
    slug: "bay-of-plenty",
    seasonKey: "autumn",
    workKey: "bayOfPlentyWork",
    noteKey: "bayOfPlentyNote",
  },
  "Queenstown Lakes": {
    // Not a region row: Queenstown Lakes is a DISTRICT inside Otago, and
    // this quiz is deliberately its own fixed vocabulary rather than the
    // catalogue's (see the note above QUESTIONS). No slug, so the heading
    // shows the name as written here.
    slug: "",
    seasonKey: "winter",
    workKey: "queenstownWork",
    noteKey: "queenstownNote",
  },
  "Central Otago": {
    slug: "",
    seasonKey: "autumn",
    workKey: "centralOtagoWork",
    noteKey: "centralOtagoNote",
  },
};

const DEFAULT_DESTINATION = "Auckland";

export function DestinationQuiz() {
  const t = useTranslations("home.quiz");
  const tVocab = useTranslations("vocab");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);

  const isResult = step === QUESTIONS.length;
  const progress = Math.round(
    ((isResult ? QUESTIONS.length : step + 1) / QUESTIONS.length) * 100,
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
      const scores = QUESTIONS[questionIndex].answers[answerIndex].scores;
      for (const [destination, points] of Object.entries(scores)) {
        totals[destination] = (totals[destination] ?? 0) + points;
      }
    });
    const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    return ranked[0]?.[0] ?? DEFAULT_DESTINATION;
  }

  const destination = isResult ? computeDestination() : null;
  const facts = destination ? DESTINATION_INFO[destination] : null;
  const destinationLabel =
    destination && facts && hasVocabOverlay(locale)
      ? localizeVocabName(
          "regions",
          { slug: facts.slug, name: destination },
          tVocab,
        )
      : destination;

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
            : t("progress", { step: step + 1, total: QUESTIONS.length })}
        </span>
      </div>

      {!isResult ? (
        <div>
          <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {t(`questions.${QUESTIONS[step].promptKey}`)}
          </h3>
          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {QUESTIONS[step].answers.map((answer, index) => (
              <button
                key={answer.labelKey}
                type="button"
                data-testid="quiz-answer"
                onClick={() => choose(index)}
                className="min-h-[72px] rounded-xl border border-border-subtle bg-surface-muted p-4 text-left font-medium hover:border-accent hover:bg-surface"
              >
                {t(`answers.${answer.labelKey}`)}
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
            {t("resultKicker")}
          </span>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {destinationLabel}
          </h3>
          {facts ? (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-surface-muted p-3">
                <span className="block text-xs text-foreground/60">
                  {t("bestSeason")}
                </span>
                <strong className="text-sm">
                  {t(`seasons.${facts.seasonKey}`)}
                </strong>
              </div>
              <div className="rounded-lg bg-surface-muted p-3">
                <span className="block text-xs text-foreground/60">
                  {t("work")}
                </span>
                <strong className="text-sm">
                  {t(`info.${facts.workKey}`)}
                </strong>
              </div>
              <div className="rounded-lg bg-surface-muted p-3">
                <span className="block text-xs text-foreground/60">
                  {t("practicalNote")}
                </span>
                <strong className="text-sm">
                  {t(`info.${facts.noteKey}`)}
                </strong>
              </div>
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="#index"
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
