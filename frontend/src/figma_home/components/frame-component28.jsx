import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import AnimatedHeading from "../../components/AnimatedHeading";
import useInView from "../../components/useInView";
import styles from "./frame-component28.module.css";

/**
 * FrameComponent28 — FAQ section (last block before footer).
 *
 * Figma spec:
 *   • Section bg:    #000 black, full-bleed.
 *   • Title "FAQ":   H Bold 64 px, orange #FEAE00, centered.
 *   • Questions:     H Medium 24 px, orange #FEAE00, "1/ ..." prefix,
 *                    "+" icon collapsed / "−" icon expanded, on the right.
 *   • Answer:        H Medium 14 px, orange #FEAE00, multi-line + bullets.
 *   • Separator:     1 px line under EVERY question (rgba orange/30 %).
 *
 * Behaviour:
 *   • ACCORDION (single-open) — all items collapsed by default.
 *   • Items, title and language come from /api/site-info → admin-managed
 *     in the "Info → FAQ" tab.
 */

const API_URL = process.env.REACT_APP_BACKEND_URL || "";

// Fallback content used if API is unreachable (keeps the section non-empty
// during the first paint). Mirrors the backend DEFAULT_SITE_INFO.faq seed.
const FALLBACK_FAQ = {
  enabled: true,
  title_en: "FAQ",
  title_bg: "Често задавани въпроси",
  items: [
    {
      id: "faq-1",
      enabled: true,
      question_en: "How to choose and buy a car from America?",
      question_bg: "Как да изберете и купите автомобил от Америка?",
      answer_en:
        "<p>To choose and buy a car from the USA, follow these basic steps:</p><ol><li>Set your budget – include car price, auction fees, delivery, customs, and repairs.</li><li>Pick a platform – popular options are Copart and IAAI.</li><li>Check the car history – use Carfax or AutoCheck.</li><li>Choose a reliable broker – they handle bidding, documents, and shipping.</li><li>Arrange delivery and customs clearance – shipping usually takes 4–8 weeks.</li><li>Repair and register the car in your country.</li></ol>",
      answer_bg: "",
    },
  ],
};

const FrameComponent28 = ({ className = "", lang = "en" }) => {
  const [faq, setFaq] = useState(FALLBACK_FAQ);
  // -1 = nothing open. Per spec, FAQ is fully collapsed on first render.
  const [openIdx, setOpenIdx] = useState(-1);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_URL}/api/site-info`)
      .then((r) => {
        if (cancelled) return;
        const block = r?.data?.faq;
        if (block && Array.isArray(block.items) && block.items.length > 0) {
          setFaq(block);
        }
      })
      .catch(() => {
        // Keep fallback — non-fatal.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (idx) => setOpenIdx((prev) => (prev === idx ? -1 : idx));

  // Filter to enabled items only (admin can hide a question without deleting it).
  const items = useMemo(
    () => (faq?.items || []).filter((it) => it && it.enabled !== false),
    [faq],
  );

  // Viewport observer for the FAQ list — declared BEFORE any early-return so
  // the hook is always called in the same order on every render.
  const [faqRef, faqInView] = useInView();

  // Hide entire section if admin disables it OR there are no items.
  if (faq && faq.enabled === false) return null;
  if (items.length === 0) return null;

  const title =
    (lang === "bg" ? faq?.title_bg : faq?.title_en) || faq?.title_en || "FAQ";

  const pickQuestion = (it) =>
    (lang === "bg" ? it.question_bg : it.question_en) ||
    it.question_en ||
    it.question_bg ||
    "";

  const pickAnswer = (it) =>
    (lang === "bg" ? it.answer_bg : it.answer_en) ||
    it.answer_en ||
    it.answer_bg ||
    "";

  return (
    <section className={[styles.rectangleParent, className].join(" ")}>
      <div className={styles.faqContent}>
        <AnimatedHeading as="h2" className={styles.faq} text={title} />
      </div>

      <div
        ref={faqRef}
        className={`${styles.faqItems} ${faqInView ? "is-visible" : ""}`}
        data-stagger="80"
        style={{ "--stagger-step": "90ms" }}
      >
        {items.map((item, idx) => {
          const isOpen = openIdx === idx;
          const question = pickQuestion(item);
          const answerHtml = pickAnswer(item);
          return (
            <div
              key={item.id || idx}
              className={[
                styles.faqItem,
                isOpen ? styles.faqItemOpen : "",
              ].join(" ")}
            >
              <button
                type="button"
                className={styles.questionContainer}
                aria-expanded={isOpen}
                onClick={() => toggle(idx)}
                data-testid={`faq-toggle-${idx}`}
              >
                <h3 className={styles.questionText}>
                  {idx + 1}/ {question}
                </h3>
                <span
                  className={[
                    styles.toggleIcon,
                    isOpen ? styles.toggleIconOpen : "",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {isOpen ? "−" : "+"}
                </span>
              </button>

              {isOpen && answerHtml && (
                <>
                  {/* Yellow 1 px divider between question and answer when
                      the item is expanded. Per Figma — every open FAQ has
                      this horizontal accent line under the title so the
                      answer reads as a separate block. Hidden when collapsed. */}
                  <div
                    className={styles.openDivider}
                    aria-hidden="true"
                  />
                  <div
                    className={styles.answer}
                    data-testid={`faq-answer-${idx}`}
                    // Answer comes from a trusted admin-only Quill editor.
                    // We render it as HTML so admins can use bold/italic/lists.
                    dangerouslySetInnerHTML={{ __html: answerHtml }}
                  />
                </>
              )}

              <div className={styles.separator} />
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default FrameComponent28;
