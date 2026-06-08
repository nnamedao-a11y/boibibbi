/**
 * BIBI Cars — Contacts page (V6) — EN/BG i18n.
 */

import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
// Header / Footer come from <PublicLayout /> at the route level — do not import here.
import AnimatedHeading from '../../components/AnimatedHeading';
import BibiOfficeMap from '../../components/public/BibiOfficeMap';
import PageHero from '../../components/public/PageHero';
import useInView from '../../components/useInView';
import { useGetInTouch } from '../../components/public/GetInTouchModal';
import { useLang } from '../../i18n';
import './ContactsPage.css';

const ASSET = '/contacts';

const T = {
  en: {
    home: 'HOME',
    crumb: 'contacts',
    title: 'contacts',
    taglineLine1: 'We are located',
    taglineLine2: 'in the center of Bulgaria.',
    addressLabel: 'Our Office Address:',
    addressLine1: 'Bulgaria, Sofia, Dragalevtsi, Vitosha Blvd. No. 230',
    addressLine2: 'Bulgaria, Sofia, Bulgaria Blvd., No. 81',
    workingHours: 'Working hours: Mon - Fri, 10.00 - 19.00',
    phoneLabel: 'Phone Number:',
    emailLabel: 'Email:',
    contactUsBtn: 'Reach out to us',
    contactUsHint: 'Have a question? Drop us a line and our team will get back to you within one business day.',
  },
  bg: {
    home: 'НАЧАЛО',
    crumb: 'контакти',
    title: 'контакти',
    taglineLine1: 'Намираме се',
    taglineLine2: 'в центъра на България.',
    addressLabel: 'Адрес на офиса:',
    addressLine1: 'България, София, Драгалевци, бул. Витоша № 230',
    addressLine2: 'България, София, бул. България № 81',
    workingHours: 'Работно време: Пн - Пт, 10.00 - 19.00',
    phoneLabel: 'Телефонен номер:',
    emailLabel: 'Имейл:',
    contactUsBtn: 'Свържете се с нас',
    contactUsHint: 'Имате въпрос? Изпратете ни съобщение и нашият екип ще се свърже с вас в рамките на един работен ден.',
  },
};

function Hero({ t }) {
  return (
    <PageHero
      home={t.home}
      crumbs={[{ label: t.crumb }]}
      title={t.title}
      testId="contacts-hero"
      className="bibi-contacts-hero"
    />
  );
}

function PinTagline({ t }) {
  const [pinRef, inView] = useInView();
  // Sequential reveal — title ("contacts") animates first via PageHero, then
  // this block (pin + tagline) follows. Stays in sync with the site-wide
  // diagonal slide-up so /catalog, /calculator, /about, /contacts all speak
  // the same visual language.
  const pageTitle = String(t.title || '');
  const titleChars = pageTitle.replace(/\s/g, '').length;
  const blockBaseDelay = titleChars * 28 + 220; // ms — start after title wave
  const tagline = `${t.taglineLine1} ${t.taglineLine2}`;
  return (
    <div ref={pinRef} className={`bibi-contacts__pin-block ${inView ? 'is-visible' : ''}`}>
      <div className="bibi-contacts__pin-inner">
        <img
          className="bibi-contacts__pin reveal reveal--block-pop"
          style={{ animationDelay: `${blockBaseDelay}ms` }}
          src={`${ASSET}/weui-location-filled.svg`}
          alt=""
          aria-hidden="true"
          loading="lazy"
        />
        <AnimatedHeading
          as="h2"
          className="bibi-contacts__tagline"
          text={tagline}
          baseDelay={blockBaseDelay + 120}
        />
      </div>
    </div>
  );
}

function MapAndInfo({ t }) {
  const [rowRef, inView] = useInView();
  return (
    <section ref={rowRef} className={`bibi-contacts__row ${inView ? 'is-visible' : ''}`}>
      <div className="bibi-contacts__photo reveal reveal--block-pop" style={{ animationDelay: '120ms' }}>
        <BibiOfficeMap />
      </div>

      <div className="bibi-contacts__info" data-stagger="80" style={{ '--stagger-step': '140ms' }}>
        <div className="bibi-contacts__info-block">
          <span className="bibi-contacts__label">{t.addressLabel}</span>
          <h3 className="bibi-contacts__addr">
            {t.addressLine1}
            <br />
            {t.addressLine2}
          </h3>
          <span className="bibi-contacts__hours">{t.workingHours}</span>
        </div>

        <div className="bibi-contacts__info-block" id="phone">
          <span className="bibi-contacts__label">{t.phoneLabel}</span>
          <div className="bibi-contacts__phones">
            <a href="tel:+359875313158">+359 875 313 158</a>
            <a href="tel:+359897884804">+359 897 884 804</a>
          </div>
        </div>

        <div className="bibi-contacts__info-block">
          <span className="bibi-contacts__label">{t.emailLabel}</span>
          <a className="bibi-contacts__email" href="mailto:hello@bibicars.bg">
            hello@bibicars.bg
          </a>
        </div>
      </div>
    </section>
  );
}

function ContactsBody({ t }) {
  return (
    <section className="bibi-contacts">
      <div className="bibi-container">
        <PinTagline t={t} />
        <MapAndInfo t={t} />
        <ContactUsCTA t={t} />
      </div>
    </section>
  );
}

/**
 * ContactUsCTA — a centred yellow pill button below the map+info row.
 * Clicking it opens the global GetInTouch modal (the same form used by the
 * homepage / footer), giving visitors a second, unmistakable way to reach
 * us straight from the Contacts page. The label intentionally differs
 * from "Get in touch" (which lives in the header / footer) so the two
 * CTAs don't read as a duplicate.
 */
function ContactUsCTA({ t }) {
  const { open } = useGetInTouch();
  return (
    <div className="bibi-contacts-cta" data-testid="contacts-cta-block">
      <p className="bibi-contacts-cta__hint">{t.contactUsHint}</p>
      <button
        type="button"
        className="bibi-contacts-cta__btn"
        onClick={() =>
          open({
            source: 'contacts-page',
            title: t.contactUsBtn,
            subtitle: t.contactUsHint,
          })
        }
        data-testid="contacts-cta-button"
      >
        {t.contactUsBtn}
      </button>
    </div>
  );
}

export default function ContactsPage() {
  const { lang } = useLang();
  const t = lang === 'bg' ? T.bg : T.en;
  const location = useLocation();

  // Smoothly scroll to the phone block when the URL contains #phone (or the
  // legacy #phones anchor used by some older links).
  useEffect(() => {
    const hash = (location.hash || '').replace('#', '').toLowerCase();
    if (!hash) return;
    if (hash !== 'phone' && hash !== 'phones') return;

    const tryScroll = () => {
      const el = document.getElementById('phone');
      if (el) {
        const rect = el.getBoundingClientRect();
        const targetY = window.scrollY + rect.top - (window.innerHeight / 2 - rect.height / 2);
        window.scrollTo({ top: Math.max(targetY, 0), behavior: 'smooth' });
        return true;
      }
      return false;
    };

    // Element may not yet be mounted on first paint; retry briefly.
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      if (tryScroll() || attempts > 10) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [location.hash, location.key]);

  return (
    <div className="bibi-about" data-testid="contacts-page">
      <Hero t={t} />
      <ContactsBody t={t} />
    </div>
  );
}
