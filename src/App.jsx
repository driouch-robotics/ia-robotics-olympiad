import { useEffect, useMemo, useState } from "react";
import { CATEGORY_LABELS, LEVELS, questions } from "./questions.js";
import {
  LANGUAGES,
  getAnswerLabel,
  getCategoryLabel,
  getLevelCopy,
  getOptionLabel,
  getPairLeftLabel,
  getQuestionExplanation,
  getQuestionPrompt,
  getTypeLabel,
  t,
} from "./i18n.js";

const logoPath = `${import.meta.env.BASE_URL}logo-club.png`;

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function pickQuestions(levelConfig) {
  const pool = questions.filter((question) => question.level === levelConfig.pool);
  const balanced = Object.keys(CATEGORY_LABELS)
    .flatMap((category) => shuffle(pool.filter((question) => question.category === category)).slice(0, Math.ceil(levelConfig.total / 4)));

  return shuffle(balanced).slice(0, levelConfig.total).map((question) => ({
    ...question,
    runtimeOptions:
      question.type === "choice" || question.type === "multi"
        ? shuffle(question.options)
        : question.type === "boolean"
          ? shuffle([true, false])
          : question.type === "order"
            ? shuffle(question.options)
            : question.type === "match"
              ? shuffle(question.pairs.map((pair) => pair.right))
              : [],
  }));
}

function emptyAnswer(question) {
  if (!question) return null;
  if (question.type === "multi" || question.type === "order") return [];
  if (question.type === "match") return {};
  return null;
}

function compareArrays(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function isAnswerComplete(question, answer) {
  if (!question) return false;
  if (question.type === "choice" || question.type === "boolean") return answer !== null;
  if (question.type === "multi") return answer.length > 0;
  if (question.type === "order") return answer.length === question.correctOrder.length;
  if (question.type === "match") return question.pairs.every((pair) => answer[pair.left]);
  return false;
}

function isCorrect(question, answer) {
  if (question.type === "choice") return answer === question.answer;
  if (question.type === "boolean") return answer === question.answer;
  if (question.type === "multi") return compareArrays([...answer].sort(), [...question.answers].sort());
  if (question.type === "order") return compareArrays(answer, question.correctOrder);
  if (question.type === "match") return question.pairs.every((pair) => answer[pair.left] === pair.right);
  return false;
}

function App() {
  const [language, setLanguage] = useState("ar");
  const [screen, setScreen] = useState("home");
  const [levelId, setLevelId] = useState(null);
  const [pendingLevelId, setPendingLevelId] = useState(null);
  const [participantName, setParticipantName] = useState("");
  const [sessionQuestions, setSessionQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [results, setResults] = useState([]);

  const levelConfig = levelId ? LEVELS[levelId] : null;
  const currentQuestion = sessionQuestions[currentIndex];
  const progress = sessionQuestions.length ? ((currentIndex + (feedback ? 1 : 0)) / sessionQuestions.length) * 100 : 0;
  const correctCount = results.filter((result) => result.correct).length;

  const categoryStats = useMemo(() => {
    return Object.keys(CATEGORY_LABELS).map((category) => {
      const categoryResults = results.filter((result) => result.category === category);
      const correct = categoryResults.filter((result) => result.correct).length;
      const label = getCategoryLabel(category, language);
      return { category, label, total: categoryResults.length, correct };
    });
  }, [language, results]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = LANGUAGES[language].dir;
  }, [language]);

  useEffect(() => {
    if (screen !== "quiz" || feedback || !currentQuestion || timeLeft <= 0) return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((value) => value - 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screen, feedback, currentQuestion, timeLeft]);

  useEffect(() => {
    if (screen === "quiz" && !feedback && currentQuestion && timeLeft === 0) {
      submitAnswer({ timedOut: true });
    }
  }, [timeLeft, screen, feedback, currentQuestion]);

  useEffect(() => {
    if (!feedback?.timedOut) return undefined;
    const timeout = window.setTimeout(() => goNext(), 1400);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [screen, currentIndex]);

  function requestParticipant(nextLevelId) {
    setPendingLevelId(nextLevelId);
  }

  function beginParticipantSession(name) {
    if (!pendingLevelId) return;
    const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!cleanName) return;
    setParticipantName(cleanName);
    startQuiz(pendingLevelId);
    setPendingLevelId(null);
  }

  function closeParticipantPrompt() {
    setPendingLevelId(null);
  }

  function startQuiz(nextLevelId) {
    const config = LEVELS[nextLevelId];
    const selected = pickQuestions(config);
    setLevelId(nextLevelId);
    setSessionQuestions(selected);
    setCurrentIndex(0);
    setAnswer(emptyAnswer(selected[0]));
    setFeedback(null);
    setResults([]);
    setTimeLeft(config.seconds);
    setScreen("quiz");
  }

  function restart() {
    setScreen("home");
    setLevelId(null);
    setPendingLevelId(null);
    setParticipantName("");
    setSessionQuestions([]);
    setCurrentIndex(0);
    setAnswer(null);
    setFeedback(null);
    setTimeLeft(0);
    setResults([]);
  }

  function retryCurrentLevel() {
    if (levelId) {
      startQuiz(levelId);
      return;
    }
    restart();
  }

  function submitAnswer({ timedOut = false } = {}) {
    if (!currentQuestion || feedback) return;
    const correct = !timedOut && isCorrect(currentQuestion, answer);
    setResults((items) => [
      ...items,
      {
        id: currentQuestion.id,
        category: currentQuestion.category,
        correct,
        timedOut,
      },
    ]);
    setFeedback({
      correct,
      timedOut,
      message: timedOut ? t(language, "timedOut") : correct ? t(language, "correct") : t(language, "wrong"),
    });
  }

  function goNext() {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= sessionQuestions.length) {
      setScreen("result");
      setFeedback(null);
      return;
    }
    setCurrentIndex(nextIndex);
    setAnswer(emptyAnswer(sessionQuestions[nextIndex]));
    setFeedback(null);
    setTimeLeft(levelConfig.seconds);
  }

  return (
    <main className={`app-shell ${language === "fr" ? "is-ltr" : ""}`}>
      <div className="background-grid" aria-hidden="true" />
      <LanguageSwitcher language={language} setLanguage={setLanguage} />
      {screen === "home" && <HomeScreen language={language} onStart={requestParticipant} />}
      {screen === "home" && pendingLevelId && (
        <ParticipantPrompt
          language={language}
          level={LEVELS[pendingLevelId]}
          onCancel={closeParticipantPrompt}
          onStart={beginParticipantSession}
        />
      )}
      {screen === "quiz" && currentQuestion && (
        <QuizScreen
          answer={answer}
          currentIndex={currentIndex}
          feedback={feedback}
          goNext={goNext}
          language={language}
          levelConfig={levelConfig}
          onExit={restart}
          participantName={participantName}
          progress={progress}
          question={currentQuestion}
          sessionLength={sessionQuestions.length}
          setAnswer={setAnswer}
          submitAnswer={submitAnswer}
          timeLeft={timeLeft}
        />
      )}
      {screen === "result" && (
        <ResultScreen
          categoryStats={categoryStats}
          correctCount={correctCount}
          language={language}
          levelConfig={levelConfig}
          onHome={restart}
          onRetry={retryCurrentLevel}
          participantName={participantName}
          total={sessionQuestions.length}
        />
      )}
    </main>
  );
}

function ParticipantPrompt({ language, level, onCancel, onStart }) {
  const [name, setName] = useState("");
  const cleanName = name.trim().replace(/\s+/g, " ");
  const levelCopy = getLevelCopy(level.id, language);

  return (
    <div className="participant-overlay" role="presentation">
      <form
        className="participant-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onStart(cleanName);
        }}
      >
        <button className="dialog-close" onClick={onCancel} title={t(language, "cancel")} type="button">
          <span aria-hidden="true">×</span>
          <span className="sr-only">{t(language, "cancel")}</span>
        </button>
        <img className="dialog-logo" src={logoPath} alt="IA & Robotics Club" />
        <p className="eyebrow">{t(language, "participantPromptEyebrow")}</p>
        <h2>{t(language, "participantPromptTitle")}</h2>
        <p className="participant-dialog-copy">
          {t(language, "participantPromptDescription", { level: levelCopy.label })}
        </p>
        <label className="participant-field">
          <span>{t(language, "participantNameLabel")}</span>
          <input
            autoFocus
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder={t(language, "participantNamePlaceholder")}
            type="text"
            value={name}
          />
        </label>
        <div className="participant-actions">
          <button className="secondary-action" onClick={onCancel} type="button">
            {t(language, "cancel")}
          </button>
          <button className="primary-action" disabled={!cleanName} type="submit">
            {t(language, "startChallenge")}
          </button>
        </div>
      </form>
    </div>
  );
}

function LanguageSwitcher({ language, setLanguage }) {
  return (
    <div className="utility-bar">
      <div className="language-switch" aria-label={t(language, "languageLabel")}>
        <span>{t(language, "languageLabel")}</span>
        <div>
          {Object.values(LANGUAGES).map((item) => (
            <button
              aria-pressed={language === item.id}
              className={language === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setLanguage(item.id)}
              type="button"
            >
              {item.short}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeScreen({ language, onStart }) {
  return (
    <section className="home-screen">
      <header className="brand-header">
        <img className="club-logo" src={logoPath} alt="IA & Robotics Club" />
        <div className="brand-copy">
          <p className="eyebrow">{t(language, "homeEyebrow")}</p>
          <h1>{t(language, "homeTitle")}</h1>
          <p>{t(language, "homeDescription")}</p>
        </div>
      </header>

      <section className="level-section" aria-label={t(language, "levelAria")}>
        <div className="section-heading">
          <span>{t(language, "chooseLevel")}</span>
        </div>
        <div className="level-grid">
          {Object.values(LEVELS).map((level) => {
            const copy = getLevelCopy(level.id, language);
            return (
              <button
                className="level-card"
                key={level.id}
                onClick={() => onStart(level.id)}
                style={{ "--level-accent": level.accent }}
                type="button"
              >
                <span className="level-orb" aria-hidden="true" />
                <span className="level-name">{copy.label}</span>
                <span className="level-subtitle">{copy.subtitle}</span>
                <span className="level-meta">
                  <strong>{level.total}</strong>
                  {t(language, "levelMeta", { total: level.total, seconds: level.seconds }).replace(String(level.total), "").trim()}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="focus-strip" aria-label={t(language, "focusAria")}>
        {Object.keys(CATEGORY_LABELS).map((key) => (
          <div className="focus-item" key={key}>
            <VisualMini type={key} />
            <span>{getCategoryLabel(key, language)}</span>
          </div>
        ))}
      </section>
    </section>
  );
}

function QuizScreen({
  answer,
  currentIndex,
  feedback,
  goNext,
  language,
  levelConfig,
  onExit,
  participantName,
  progress,
  question,
  sessionLength,
  setAnswer,
  submitAnswer,
  timeLeft,
}) {
  const complete = isAnswerComplete(question, answer);
  const timeRatio = Math.max(0, (timeLeft / levelConfig.seconds) * 100);

  return (
    <section className={`quiz-screen type-${question.type} ${feedback ? "has-feedback" : ""}`}>
      <header className="quiz-topbar">
        <button className="exit-quiz" onClick={onExit} title={t(language, "exitChallenge")} type="button">
          <span aria-hidden="true">×</span>
          <span className="sr-only">{t(language, "exitChallenge")}</span>
        </button>
        <img className="quiz-logo" src={logoPath} alt="IA & Robotics Club" />
        <ParticipantTag language={language} name={participantName} />
        <div className="progress-wrap" aria-label={t(language, "progressAria")}>
          <div className="progress-info">
            <span>
              {t(language, "questionOf", { current: currentIndex + 1, total: sessionLength })}
            </span>
            <strong>{getLevelCopy(levelConfig.id, language).label}</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className={`timer-ring ${timeLeft <= 5 ? "danger" : ""}`} style={{ "--time": `${timeRatio}%` }}>
          <span>{timeLeft}</span>
          <small>{t(language, "seconds")}</small>
        </div>
      </header>

      <div className="quiz-layout">
        <QuestionVisual type={question.visual} category={question.category} />
        <article className="question-panel">
          <div className="question-meta">
            <span>{getCategoryLabel(question.category, language)}</span>
            <span>{getTypeLabel(question.type, language)}</span>
          </div>
          <h2>{getQuestionPrompt(question, language)}</h2>
          <AnswerControl
            question={question}
            answer={answer}
            language={language}
            setAnswer={setAnswer}
            locked={Boolean(feedback)}
          />
          {!feedback && (
            <div className="action-row">
              <button className="primary-action" disabled={!complete} onClick={() => submitAnswer()} type="button">
                {t(language, "submit")}
              </button>
            </div>
          )}
        </article>
      </div>

      {feedback && <FeedbackDock feedback={feedback} language={language} question={question} onNext={goNext} />}
    </section>
  );
}

function AnswerControl({ question, answer, language, setAnswer, locked }) {
  if (question.type === "choice" || question.type === "boolean") {
    const options = question.type === "boolean" ? question.runtimeOptions : question.runtimeOptions;
    return (
      <div className="answer-grid">
        {options.map((option) => (
          <button
            className={`answer-option ${answer === option ? "selected" : ""}`}
            disabled={locked}
            key={String(option)}
            onClick={() => setAnswer(option)}
            type="button"
          >
            {getOptionLabel(question, option, language)}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "multi") {
    return (
      <div className="answer-grid">
        {question.runtimeOptions.map((option) => {
          const selected = answer.includes(option);
          return (
            <button
              className={`answer-option ${selected ? "selected" : ""}`}
              disabled={locked}
              key={option}
              onClick={() =>
                setAnswer((items) => (selected ? items.filter((item) => item !== option) : [...items, option]))
              }
              type="button"
            >
              <span className="checkmark">{selected ? "✓" : ""}</span>
              {getOptionLabel(question, option, language)}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === "order") {
    const remaining = question.runtimeOptions.filter((option) => !answer.includes(option));
    return (
      <div className="order-zone">
        <div className="order-answer">
          {answer.length === 0 ? (
            <span className="muted">{t(language, "orderPlaceholder")}</span>
          ) : (
            answer.map((item, index) => (
              <button
                className="sequence-pill"
                disabled={locked}
                key={item}
                onClick={() => setAnswer((items) => items.filter((value) => value !== item))}
                type="button"
              >
                {index + 1}. {getOptionLabel(question, item, language)}
              </button>
            ))
          )}
        </div>
        <div className="answer-grid compact">
          {remaining.map((option) => (
            <button
              className="answer-option"
              disabled={locked}
              key={option}
              onClick={() => setAnswer((items) => [...items, option])}
              type="button"
            >
              {getOptionLabel(question, option, language)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === "match") {
    return (
      <div className="match-list">
        {question.pairs.map((pair) => (
          <label className="match-row" key={pair.left}>
            <span>{getPairLeftLabel(question, pair.left, language)}</span>
            <select
              disabled={locked}
              value={answer[pair.left] || ""}
              onChange={(event) => setAnswer((items) => ({ ...items, [pair.left]: event.target.value }))}
            >
              <option value="">{t(language, "matchPlaceholder")}</option>
              {question.runtimeOptions.map((option) => (
                <option key={option} value={option}>
                  {getOptionLabel(question, option, language)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  }

  return null;
}

function FeedbackDock({ feedback, language, question, onNext }) {
  return (
    <aside className={`feedback-dock ${feedback.correct ? "success" : "error"}`}>
      <div>
        <strong>{feedback.message}</strong>
        <p>
          {feedback.correct
            ? getQuestionExplanation(question, language)
            : `${getQuestionExplanation(question, language)} ${t(language, "correctAnswer", {
                answer: getAnswerLabel(question, language),
              })}`}
        </p>
      </div>
      <button className="continue-action" onClick={onNext} type="button">
        {t(language, "continue")}
      </button>
    </aside>
  );
}

function ParticipantTag({ language, name }) {
  return (
    <div className="participant-tag" title={name}>
      <span>{t(language, "participantBadge")}</span>
      <strong>{name}</strong>
    </div>
  );
}

function playPerfectScoreSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  try {
    const audio = new AudioContext();
    const masterGain = audio.createGain();
    masterGain.gain.setValueAtTime(0.0001, audio.currentTime);
    masterGain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.04);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 1.45);
    masterGain.connect(audio.destination);

    const notes = [
      [523.25, 0],
      [659.25, 0.14],
      [783.99, 0.28],
      [1046.5, 0.48],
      [987.77, 0.7],
      [1174.66, 0.88],
    ];

    notes.forEach(([frequency, delay]) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime + delay);
      gain.gain.setValueAtTime(0.0001, audio.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + delay + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + 0.22);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(audio.currentTime + delay);
      oscillator.stop(audio.currentTime + delay + 0.24);
    });

    window.setTimeout(() => audio.close(), 1700);
  } catch {
    // Browsers may block audio in some privacy modes; the visual celebration still works.
  }
}

function ResultScreen({ categoryStats, correctCount, language, levelConfig, onHome, onRetry, participantName, total }) {
  const percent = total ? Math.round((correctCount / total) * 100) : 0;
  const isPerfect = percent === 100;
  const title = isPerfect
    ? t(language, "perfectTitle")
    : percent >= 85
      ? t(language, "excellent")
      : percent >= 60
        ? t(language, "good")
        : t(language, "needsPractice");

  useEffect(() => {
    if (isPerfect) playPerfectScoreSound();
  }, [isPerfect]);

  return (
    <section className={`result-screen ${isPerfect ? "perfect-result" : ""}`}>
      {isPerfect && (
        <div className="celebration-burst" aria-hidden="true">
          {Array.from({ length: 24 }, (_, index) => (
            <span key={index} style={{ "--piece": index }} />
          ))}
        </div>
      )}
      <img className="result-logo" src={logoPath} alt="IA & Robotics Club" />
      <div className="result-participant">
        <span>{isPerfect ? t(language, "winnerBadge") : t(language, "participantResultLabel")}</span>
        <strong>{participantName}</strong>
      </div>
      <div className="score-hero">
        <div className="score-ring" style={{ "--score": `${percent}%` }}>
          <span>{percent}%</span>
        </div>
        <div>
          <p className="eyebrow">
            {isPerfect ? t(language, "perfectEyebrow") : t(language, "resultEyebrow", { level: getLevelCopy(levelConfig.id, language).label })}
          </p>
          <h1>{title}</h1>
          <p>
            {isPerfect
              ? t(language, "perfectDescription", { name: participantName, total })
              : t(language, "resultDescription", { correct: correctCount, total })}
          </p>
        </div>
      </div>

      <div className="breakdown">
        {categoryStats.map((item) => (
          <div className="stat-line" key={item.category}>
            <span>{item.label}</span>
            <strong>
              {item.correct}/{item.total || 0}
            </strong>
          </div>
        ))}
      </div>

      <div className="result-actions">
        <button className="primary-action" onClick={onRetry} type="button">
          {t(language, "retryChallenge")}
        </button>
        <button className="secondary-action" onClick={onHome} type="button">
          {t(language, "backHome")}
        </button>
      </div>
    </section>
  );
}

function VisualMini({ type }) {
  const symbols = {
    ai: "AI",
    robotics: "⚙",
    cs: "</>",
    tech: "CPU",
  };
  return (
    <span className={`mini-visual ${type}`} aria-hidden="true">
      {symbols[type]}
    </span>
  );
}

function QuestionVisual({ type, category }) {
  return (
    <aside className={`visual-panel ${type} ${category}`} aria-hidden="true">
      <div className="visual-chip main-chip" />
      <div className="visual-chip side-chip" />
      <div className="visual-lines">
        <span />
        <span />
        <span />
      </div>
      <div className="visual-core">
        <span>{visualText(type)}</span>
      </div>
    </aside>
  );
}

function visualText(type) {
  const text = {
    ai: "AI",
    data: "DATA",
    tools: "TOOLS",
    vision: "VISION",
    robot: "BOT",
    sensor: "SENSOR",
    motor: "MOTOR",
    code: "CODE",
    web: "WEB",
    tech: "TECH",
    security: "SEC",
    network: "NET",
  };
  return text[type] || "IA";
}

export default App;
