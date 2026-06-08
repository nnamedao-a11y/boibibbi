/**
 * BIBI Cars — About Us page (V8) with EN/BG i18n.
 * Layout: BibiHeader + Hero + FrameOne + FrameTwo + ConsultationCTA + BibiFooter.
 */

import React, { useState } from 'react';
import { API_URL } from '../../App';
import AnimatedHeading from '../../components/AnimatedHeading';
import PageHero from '../../components/public/PageHero';
import useInView from '../../components/useInView';
// Header / Footer come from <PublicLayout /> at the route level — do not import here.
import { useLang } from '../../i18n';
import './AboutPage.css';

const ASSET = '/about-us';

const T = {
  en: {
    home: 'HOME /',
    aboutCrumb: 'About us',
    title: 'About us',
    tagline: 'We are your reliable partner in the world of cars.',
    frame1Pre: 'Our company specializes in selling cars from the USA and Korea at ',
    frame1Accent: 'the best prices on the market.',
    frame2Pre: 'We combine competitive pricing with ',
    frame2Accent: 'a high level of service',
    frame2Suf: ' so that you get not just a car, but confidence in your choice.',
    frame2Body: "We'll help you find the perfect option that fully matches your expectations, lifestyle, and budget.",
    ctaTitleYellow: 'Get free professional advice',
    ctaTitleWhite: 'on choosing a car',
    fullName: 'Full Name*',
    fullNamePh: 'Enter your Full name',
    phoneLabel: 'Your Phone Number*',
    phonePh: '87 123 4567',
    submitIdle: 'SEND REQUEST',
    submitBusy: 'SENDING…',
    submitDone: 'SENT ✓',
    okMsg: 'Thank you! We will contact you shortly.',
    errName: 'Please enter your full name',
    errPhone: 'Enter a valid Bulgarian phone (e.g. 87 123 4567)',
    errSend: 'Could not send request, please try again',
    quickCallTitle: 'Quick call to our office',
  },
  bg: {
    home: 'НАЧАЛО /',
    aboutCrumb: 'За нас',
    title: 'За нас',
    tagline: 'Ние сме вашият надежден партньор в света на автомобилите.',
    frame1Pre: 'Нашата компания е специализирана в продажба на автомобили от САЩ и Корея на ',
    frame1Accent: 'най-добрите цени на пазара.',
    frame2Pre: 'Съчетаваме конкурентни цени с ',
    frame2Accent: 'високо ниво на обслужване',
    frame2Suf: ', за да получите не само кола, но и увереност в избора си.',
    frame2Body: 'Ще ви помогнем да намерите идеалния вариант, който напълно отговаря на очакванията, начина на живот и бюджета ви.',
    ctaTitleYellow: 'Получете безплатна професионална консултация',
    ctaTitleWhite: 'за избора на автомобил',
    fullName: 'Име и фамилия*',
    fullNamePh: 'Въведете вашето име и фамилия',
    phoneLabel: 'Вашият телефонен номер*',
    phonePh: '87 123 4567',
    submitIdle: 'ИЗПРАТИ ЗАЯВКА',
    submitBusy: 'ИЗПРАЩАНЕ…',
    submitDone: 'ИЗПРАТЕНО ✓',
    okMsg: 'Благодарим ви! Ще се свържем с вас скоро.',
    errName: 'Моля, въведете вашето име и фамилия',
    errPhone: 'Въведете валиден български телефон (напр. 87 123 4567)',
    errSend: 'Не успяхме да изпратим заявката, опитайте отново',
    quickCallTitle: 'Бързо обаждане в офиса',
  },
};

function Hero({ t }) {
  // Sequential reveal: animate the page title first (via PageHero), then start
  // the tagline ("We are your reliable partner…") AFTER the title finishes.
  // Matches the homepage hero pattern (see figma_home/homepage1.jsx):
  // baseDelay = nonSpaceCharCount * stepMs (28ms) of the previous heading.
  const titleChars = String(t.title || '').replace(/\s/g, '').length;
  const taglineDelay = titleChars * 28 + 220; // step delay + small visual breath
  return (
    <>
      <PageHero
        home={t.home.replace(/\s*\/\s*$/, "")}
        crumbs={[{ label: t.aboutCrumb }]}
        title={t.title}
        testId="about-hero"
      />
      <section className="bibi-hero bibi-about-tagline-section">
        <div className="bibi-container">
          <AnimatedHeading
            as="p"
            className="bibi-hero__tagline"
            text={t.tagline}
            baseDelay={taglineDelay}
          />
        </div>
      </section>
    </>
  );
}

function FrameOne({ t }) {
  const [secRef, inView] = useInView();
  return (
    <section ref={secRef} className={`bibi-section bibi-frame-1 ${inView ? 'is-visible' : ''}`}>
      <div className="bibi-frame-1__canvas">
        <figure className="bibi-frame-1__photo--big reveal reveal--block-pop" style={{ animationDelay: '120ms' }}>
          <img src={`${ASSET}/IMG-0463-1-1@2x.png`} alt="BIBI Cars team with imported truck" loading="lazy" />
        </figure>
        <h2 className="bibi-frame-1__text reveal reveal--slide-left" style={{ animationDelay: '0ms' }}>
          {t.frame1Pre}<span className="bibi-accent">{t.frame1Accent}</span>
        </h2>
        <figure className="bibi-frame-1__photo--small reveal reveal--block-pop" style={{ animationDelay: '260ms' }}>
          <img src={`${ASSET}/IMG-0450-1-1@2x.png`} alt="Happy customers next to imported car" loading="lazy" />
        </figure>
      </div>
    </section>
  );
}

function FrameTwo({ t }) {
  const [secRef, inView] = useInView();
  return (
    <section ref={secRef} className={`bibi-section bibi-frame-2 ${inView ? 'is-visible' : ''}`}>
      <div className="bibi-frame-2__canvas">
        <h2 className="bibi-frame-2__headline reveal reveal--slide-left" style={{ animationDelay: '0ms' }}>
          {t.frame2Pre}<span className="bibi-accent">{t.frame2Accent}</span>{t.frame2Suf}
        </h2>
        <figure className="bibi-frame-2__photo--small reveal reveal--block-pop" style={{ animationDelay: '180ms' }}>
          <img src={`${ASSET}/image-84-1@2x.png`} alt="BIBI Cars showroom" loading="lazy" />
        </figure>
        <p className="bibi-frame-2__text reveal reveal--slide-left" style={{ animationDelay: '120ms' }}>{t.frame2Body}</p>
        <figure className="bibi-frame-2__photo--big reveal reveal--block-pop" style={{ animationDelay: '320ms' }}>
          <img src={`${ASSET}/IMG-8461-1-1@2x.png`} alt="BIBI Cars team" loading="lazy" />
        </figure>
      </div>
    </section>
  );
}

function ConsultationCTA({ t }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const normalizeBgPhone = (raw) => {
    let digits = (raw || '').replace(/\D/g, '');
    if (digits.startsWith('359')) digits = digits.slice(3);
    if (digits.startsWith('0')) digits = digits.slice(1);
    return digits;
  };

  const isValidBgPhone = (raw) => {
    const d = normalizeBgPhone(raw);
    if (d.length === 9 && /^[89]/.test(d)) return true;
    if (d.length === 8 && /^[2-7]/.test(d)) return true;
    if (d.length === 9 && /^[2-7]/.test(d)) return true;
    return false;
  };

  const formatBgPhone = (raw) => {
    const d = normalizeBgPhone(raw).slice(0, 9);
    if (d.length === 0) return '';
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
    return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  };

  const handlePhoneChange = (e) => {
    setPhone(formatBgPhone(e.target.value));
    if (phoneError) setPhoneError('');
  };

  const handlePhoneBlur = () => {
    setPhoneError(phone && !isValidBgPhone(phone) ? t.errPhone : '');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy || done) return;
    setError('');
    setPhoneError('');

    const name = fullName.trim();
    if (!name || name.length < 2) {
      setError(t.errName);
      return;
    }
    if (!isValidBgPhone(phone)) {
      setPhoneError(t.errPhone);
      return;
    }

    const e164Phone = '+359' + normalizeBgPhone(phone);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/leads/consultation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name, phone: e164Phone, source: 'about-us' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.detail || 'Request failed');
      setDone(true);
      setFullName('');
      setPhone('');
    } catch (err) {
      setError(err.message || t.errSend);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bibi-cta">
      <div className="bibi-cta__inner">
        <h2 className="bibi-cta__title">
          <span className="bibi-cta__title-yellow">{t.ctaTitleYellow}</span>
          <span className="bibi-cta__title-white">{t.ctaTitleWhite}</span>
        </h2>

        <form className="bibi-form" onSubmit={submit} noValidate>
          <div className="bibi-form__fields">
            <label className="bibi-form__field">
              <span className="bibi-form__label">{t.fullName}</span>
              <input
                type="text"
                placeholder={t.fullNamePh}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={busy || done}
                autoComplete="name"
                data-testid="about-form-name"
                maxLength={120}
              />
            </label>

            <label className={`bibi-form__field bibi-form__field--phone ${phoneError ? 'bibi-form__field--invalid' : ''}`}>
              <span className="bibi-form__label">{t.phoneLabel}</span>
              <span className="bibi-form__phone-prefix">
                <img src={`${ASSET}/emojione-v1-flag-for-bulgaria.svg`} alt="BG" />
                <span>+359</span>
              </span>
              <input
                type="tel"
                inputMode="numeric"
                placeholder={t.phonePh}
                value={phone}
                onChange={handlePhoneChange}
                onBlur={handlePhoneBlur}
                disabled={busy || done}
                autoComplete="tel"
                data-testid="about-form-phone"
                maxLength={13}
                aria-invalid={!!phoneError}
              />
            </label>
            {phoneError && <div className="bibi-form__error" role="alert" data-testid="about-form-phone-error">{phoneError}</div>}

            {error && <div className="bibi-form__error" role="alert">{error}</div>}
            {done && <div className="bibi-form__ok">{t.okMsg}</div>}
          </div>

          <button
            type="submit"
            className="bibi-btn bibi-btn--primary bibi-form__submit"
            disabled={busy || done}
            data-testid="about-form-submit"
          >
            {busy ? t.submitBusy : done ? t.submitDone : t.submitIdle}
          </button>
        </form>

        <div className="bibi-quickcall">
          <h3>{t.quickCallTitle}</h3>
          <div className="bibi-quickcall__phones">
            <a href="tel:+359875313158">+359 875 313 158</a>
            <a href="tel:+359897884804">+359 897 884 804</a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AboutPage() {
  const { lang } = useLang();
  const t = lang === 'bg' ? T.bg : T.en;
  // Header / Footer are provided by <PublicLayout /> at the route level.
  return (
    <div className="bibi-about" data-testid="about-page">
      <Hero t={t} />
      <FrameOne t={t} />
      <FrameTwo t={t} />
      <ConsultationCTA t={t} />
    </div>
  );
}
