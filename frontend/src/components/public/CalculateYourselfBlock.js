import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './CalculateYourselfBlock.css';

/**
 * "Calculate a car yourself with a price guarantee" — pixel-perfect block
 * matching the Figma comp (1922 × 1286 frame).
 *
 *   ┌──────────────── #FEAE00 outer frame ─────────────────┐
 *   │   ┌──────────── #000 inner card ──────────────────┐  │
 *   │   │             [ H Bold orange ]                 │  │
 *   │   │      Calculate a car yourself                 │  │
 *   │   │      with a price guarantee  (white)          │  │
 *   │   │                                               │  │
 *   │   │  ┌───── Ford ─────┐  From the USA and Korea   │  │
 *   │   │  │                │  ┌─────────────────────┐  │  │
 *   │   │  │   pickup img   │  │ 🔍 Search by VIN... │  │  │
 *   │   │  │                │  └─────────────────────┘  │  │
 *   │   │  │                │  ┌─────────────────────┐  │  │
 *   │   │  └────────────────┘  │      CALCULATE      │  │  │
 *   │   │                       └─────────────────────┘  │  │
 *   │   │                              all catalog +     │  │
 *   │   └─────────────────────────────────────────────────┘  │
 *   └──────────────────────────────────────────────────────┘
 */

// Dark moody Ford F-Series pickup in industrial / foggy setting (Figma asset)
const TRUCK_IMG = '/figma/image-93@2x.webp';
const TRUCK_FALLBACK = '/mobile/image-93@2x.png';

export default function CalculateYourselfBlock() {
  const [vin, setVin] = useState('');
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    const v = (vin || '').trim();
    if (!v) {
      navigate('/calculator');
      return;
    }
    const clean = v.toUpperCase().replace(/[\s-]/g, '');
    navigate(`/vin/${encodeURIComponent(clean)}`);
  };

  return (
    <section className="cyb-frame" data-testid="calculate-yourself-block">
      <div className="cyb-card">
        <h2 className="cyb-title">
          <span className="cyb-title-yellow">Calculate a car yourself</span>
          <span className="cyb-title-white">with a price guarantee</span>
        </h2>

        <div className="cyb-grid">
          {/* LEFT — Ford pickup square hero */}
          <div className="cyb-photo">
            <img
              src={TRUCK_IMG}
              alt="Ford pickup ready for delivery"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.src = TRUCK_FALLBACK;
              }}
            />
          </div>

          {/* RIGHT — copy + form */}
          <div className="cyb-right">
            <div className="cyb-subtitle">From the USA and Korea</div>

            <form onSubmit={submit} className="cyb-form" data-testid="calc-yourself-form">
              <div className="cyb-input-wrap">
                <svg
                  className="cyb-input-icon"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  placeholder="Search by VIN or lot number"
                  className="cyb-input"
                  data-testid="calc-yourself-vin-input"
                  aria-label="VIN or lot number"
                />
              </div>

              <button
                type="submit"
                className="cyb-cta"
                data-testid="calc-yourself-submit"
              >
                CALCULATE
              </button>

              <Link
                to="/catalog"
                className="cyb-all-catalog"
                data-testid="calc-yourself-all-catalog"
              >
                ALL CATALOG +
              </Link>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
