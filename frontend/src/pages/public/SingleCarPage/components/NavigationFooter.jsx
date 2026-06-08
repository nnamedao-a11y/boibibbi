import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../../../../i18n';
import { useSingleCarT } from '../i18n';
import styles from './NavigationFooter.module.css';

/**
 * "Go back to catalog" link + "Have a question? Contact us" card. EN/BG i18n.
 */
const NavigationFooter = ({
  className = '',
  phones = ['+359 875 313 158', '+359 897 884 804'],
  catalogPath = '/catalog',
}) => {
  const { lang } = useLang();
  const t = useSingleCarT(lang);
  return (
    <section className={[styles.navigationFooter, className].join(' ')}>
      <div className={styles.navigationContainer}>
        <div className={styles.navigationLinks}>
          <Link to={catalogPath} className={styles.goBackTo}>
            {t.goBackToCatalog}
          </Link>
        </div>
        <div className={styles.contactQuestion}>
          <div className={styles.navigation}>
            <h2 className={styles.haveAQuestion}>{t.haveAQuestion}</h2>
            <h2 className={styles.haveAQuestion}>{t.contactUs}</h2>
          </div>
          <div className={styles.navigation2}>
            {phones.map((p) => (
              <h3 className={styles.h3} key={p}>
                <a href={`tel:${p.replace(/\s+/g, '')}`} className={styles.phoneLink}>
                  {p}
                </a>
              </h3>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default NavigationFooter;
