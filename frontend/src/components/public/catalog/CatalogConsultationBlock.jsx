/**
 * CatalogConsultationBlock — Figma 1:1
 * Block: 1920 × 1788 px (fixed), background #1A1B19
 *   • 172 px top pad → H2 (yellow) → 32 px → H3 (white)
 *   • 128 px → form (372 px wide)
 *   • 128 px → contact card (566 × 333)
 *   • 161 px bottom pad
 *
 * Behaviour:
 *   • Bulgarian phone validation (+359 + 9 digits)
 *   • Submits to /api/public/leads/quick → manager notified via lead pipeline
 *   • Shows a brand-styled success modal on completion
 */
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import styles from './CatalogConsultationBlock.module.css';
import { API_URL } from '../../../App';
import { useLang } from '../../../i18n';

/* Bilingual copy — switches reactively with the global language toggle.
 * Same source-of-truth shape used in other public blocks (catalog, blog). */
const T = {
  en: {
    titleYellow: "DON'T POSTPONE BUYING A CAR",
    titleWhite:  'Free consultation',
    fullName:    'Full Name',
    fullNamePh:  'Enter your full name',
    phone:       'Your Phone Number',
    desired:     'Desired Vehicle',
    desiredPh:   'Enter your desired vehicle',
    budget:      'Your Budget',
    budgetPh:    'Enter your budget',
    wishes:      'Additional Requirements',
    wishesPh:    'Add additional preferences',
    send:        'SEND REQUEST',
    sending:     'SENDING…',
    haveQuestion:'Have a question?',
    contactUs:   'Contact us',
    errName:     'Please enter your full name.',
    errPhone:    'Phone must be +359 followed by 9 digits.',
    errBudget:   'Please enter your budget.',
    successTitle:'Request sent successfully',
    successText: 'Thank you! Our manager will review your request and contact you shortly to help you choose the perfect vehicle.',
    successBtn:  'Got it',
  },
  bg: {
    titleYellow: 'НЕ ОТЛАГАЙТЕ ПОКУПКАТА НА КОЛА',
    titleWhite:  'Безплатна консултация',
    fullName:    'Пълно име',
    fullNamePh:  'Въведете пълното си име',
    phone:       'Вашият телефонен номер',
    desired:     'Желан автомобил',
    desiredPh:   'Въведете желания автомобил',
    budget:      'Вашият бюджет',
    budgetPh:    'Въведете вашия бюджет',
    wishes:      'Допълнителни изисквания',
    wishesPh:    'Добавете допълнителни предпочитания',
    send:        'ИЗПРАТИ ЗАЯВКА',
    sending:     'ИЗПРАЩАНЕ…',
    haveQuestion:'Имате въпрос?',
    contactUs:   'Свържете се с нас',
    errName:     'Моля, въведете пълното си име.',
    errPhone:    'Телефонът трябва да е +359, последван от 9 цифри.',
    errBudget:   'Моля, въведете вашия бюджет.',
    successTitle:'Заявката е изпратена успешно',
    successText: 'Благодарим Ви! Наш мениджър ще прегледа заявката Ви и ще се свърже с Вас скоро, за да Ви помогне да изберете перфектния автомобил.',
    successBtn:  'Разбрах',
  },
};

const initialForm = {
  name: '',
  phone: '+359',
  desiredCar: '',
  budget: '',
  wishes: '',
};

/* Strict Bulgarian phone — must be +359 followed by exactly 9 digits. */
const BG_PHONE_RE = /^\+359\d{9}$/;

export default function CatalogConsultationBlock() {
  const { lang } = useLang();
  const t = T[lang === 'bg' ? 'bg' : 'en'];

  const [form, setForm]       = useState(initialForm);
  const [errors, setErrors]   = useState({});
  const [submitting, setSub]  = useState(false);
  const [globalErr, setGErr]  = useState('');
  const [showSuccess, setSS]  = useState(false);

  const change = (k) => (e) => {
    let v = e.target.value;
    if (k === 'phone') {
      // Keep "+359" prefix locked; allow only digits afterwards
      if (!v.startsWith('+359')) v = '+359' + v.replace(/^\+?3?5?9?/, '').replace(/\D/g, '');
      else v = '+359' + v.slice(4).replace(/\D/g, '').slice(0, 9);
    }
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim() || form.name.trim().length < 2)
      e.name = t.errName;
    if (!BG_PHONE_RE.test(form.phone.replace(/\s/g, '')))
      e.phone = t.errPhone;
    if (!form.budget.trim())
      e.budget = t.errBudget;
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setGErr('');
    setSub(true);
    try {
      await axios.post(`${API_URL}/api/public/leads/quick`, {
        name:       form.name.trim(),
        phone:      form.phone.replace(/\s/g, ''),
        desiredCar: form.desiredCar.trim(),
        budget:     form.budget.trim(),
        message:    form.wishes.trim(),
        source:     'catalog_consultation',
        landing_page: typeof window !== 'undefined' ? window.location.href : null,
      });
      setForm(initialForm);
      setSS(true);
    } catch (err) {
      setGErr(
        err?.response?.data?.detail ||
        'Could not send request. Please try again or call us directly.'
      );
    } finally {
      setSub(false);
    }
  };

  return (
    <>
      <section
        className={styles.section}
        data-testid="catalog-consultation-section"
      >
        <h2 className={styles.titleYellow}>{t.titleYellow}</h2>
        <h3 className={styles.titleWhite}>{t.titleWhite}</h3>

        <form
          className={styles.form}
          onSubmit={submit}
          noValidate
          data-testid="catalog-consultation-form"
        >
          {/* Full Name */}
          <div className={styles.field}>
            <label htmlFor="ccb-name" className={styles.label}>
              {t.fullName} <span className={styles.req}>*</span>
            </label>
            <input
              id="ccb-name"
              className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
              type="text"
              autoComplete="name"
              placeholder={t.fullNamePh}
              value={form.name}
              onChange={change('name')}
              data-testid="catalog-consultation-name"
            />
            {errors.name && (
              <span className={styles.fieldError} data-testid="catalog-consultation-error-name">
                {errors.name}
              </span>
            )}
          </div>

          {/* Phone Number — Bulgarian */}
          <div className={styles.field}>
            <label htmlFor="ccb-phone" className={styles.label}>
              {t.phone} <span className={styles.req}>*</span>
            </label>
            <div className={styles.inputWithIcon}>
              <img
                src="/about-us/emojione-v1-flag-for-bulgaria.svg"
                alt=""
                className={styles.icon}
                width={22}
                height={16}
              />
              <input
                id="ccb-phone"
                className={`${styles.input} ${styles.inputPadIcon} ${errors.phone ? styles.inputError : ''}`}
                type="tel"
                autoComplete="tel"
                placeholder="+359"
                value={form.phone}
                onChange={change('phone')}
                inputMode="tel"
                maxLength={13}
                data-testid="catalog-consultation-phone"
              />
            </div>
            {errors.phone && (
              <span className={styles.fieldError} data-testid="catalog-consultation-error-phone">
                {errors.phone}
              </span>
            )}
          </div>

          {/* Desired Vehicle */}
          <div className={styles.field}>
            <label htmlFor="ccb-car" className={styles.label}>{t.desired}</label>
            <input
              id="ccb-car"
              className={styles.input}
              type="text"
              placeholder={t.desiredPh}
              value={form.desiredCar}
              onChange={change('desiredCar')}
              data-testid="catalog-consultation-car"
            />
          </div>

          {/* Budget */}
          <div className={styles.field}>
            <label htmlFor="ccb-budget" className={styles.label}>
              {t.budget} <span className={styles.req}>*</span>
            </label>
            <div className={styles.inputWithIcon}>
              <img
                src="/figma/calc/euro-icon.svg"
                alt=""
                className={styles.icon}
                width={16}
                height={16}
              />
              <input
                id="ccb-budget"
                className={`${styles.input} ${styles.inputPadIcon} ${errors.budget ? styles.inputError : ''}`}
                type="text"
                inputMode="numeric"
                placeholder={t.budgetPh}
                value={form.budget}
                onChange={change('budget')}
                data-testid="catalog-consultation-budget"
              />
            </div>
            {errors.budget && (
              <span className={styles.fieldError} data-testid="catalog-consultation-error-budget">
                {errors.budget}
              </span>
            )}
          </div>

          {/* Additional Requirements */}
          <div className={styles.field}>
            <label htmlFor="ccb-wishes" className={styles.label}>{t.wishes}</label>
            <textarea
              id="ccb-wishes"
              className={`${styles.input} ${styles.textarea}`}
              placeholder={t.wishesPh}
              value={form.wishes}
              onChange={change('wishes')}
              data-testid="catalog-consultation-wishes"
              rows={3}
            />
          </div>

          {globalErr && (
            <span className={styles.fieldError} role="alert" data-testid="catalog-consultation-global-error">
              {globalErr}
            </span>
          )}

          <button
            type="submit"
            className={styles.submit}
            disabled={submitting}
            data-testid="catalog-consultation-submit"
          >
            {submitting ? t.sending : t.send}
          </button>
        </form>

        <div className={styles.contactCard} data-testid="catalog-consultation-contact">
          <div className={styles.contactQuestion}>{t.haveQuestion}</div>
          <div className={styles.contactUs}>{t.contactUs}</div>
          <a className={styles.phone} href="tel:+359875313158">+359 875 313 158</a>
          <a className={styles.phone} href="tel:+359897884804">+359 897 884 804</a>
        </div>
      </section>

      {showSuccess && (
        <SuccessModal onClose={() => setSS(false)} t={t} />
      )}
    </>
  );
}

function SuccessModal({ onClose, t }) {
  const cardRef = useRef(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ccb-success-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="catalog-consultation-success-modal"
    >
      <div className={styles.modalCard} ref={cardRef}>
        <button
          type="button"
          className={styles.modalClose}
          aria-label="Close"
          onClick={onClose}
          data-testid="catalog-consultation-success-close"
        >
          ×
        </button>
        <div className={styles.modalIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 id="ccb-success-title" className={styles.modalTitle}>{t.successTitle}</h2>
        <p className={styles.modalText}>{t.successText}</p>
        <button
          type="button"
          className={styles.modalBtn}
          onClick={onClose}
          data-testid="catalog-consultation-success-ok"
        >
          {t.successBtn}
        </button>
      </div>
    </div>
  );
}
