import React, { useMemo } from 'react';
import styles from './Button1.module.css';

/**
 * Single-car page CTA button — port of `components/b-u-t-t-o-n1.tsx` from the
 * Figma export. Default size 171×45 / 14px Mazzard / orange background. All
 * sizing & typography overrides are exposed as inline-style props so we keep
 * 1:1 parity with the original component API used in card1 / card2 / etc.
 */
const Button1 = ({
  className = '',
  property1 = 'Default',
  cONTACTUS,
  showBUTTON,
  bUTTONWidth,
  bUTTONBorder,
  cONTACTUSHeight,
  cONTACTUSDisplay,
  cONTACTUSAlignItems,
  cONTACTUSJustifyContent,
  cONTACTUSTextTransform,
  onClick,
  type = 'button',
}) => {
  const buttonStyle = useMemo(
    () => ({ width: bUTTONWidth, border: bUTTONBorder }),
    [bUTTONWidth, bUTTONBorder],
  );
  const contactUsStyle = useMemo(
    () => ({
      height: cONTACTUSHeight,
      display: cONTACTUSDisplay,
      alignItems: cONTACTUSAlignItems,
      justifyContent: cONTACTUSJustifyContent,
      textTransform: cONTACTUSTextTransform,
    }),
    [
      cONTACTUSHeight,
      cONTACTUSDisplay,
      cONTACTUSAlignItems,
      cONTACTUSJustifyContent,
      cONTACTUSTextTransform,
    ],
  );

  if (!showBUTTON) return null;
  return (
    <button
      type={type}
      className={[styles.button, className].join(' ')}
      data-property1={property1}
      style={buttonStyle}
      onClick={onClick}
    >
      <div className={styles.contactUs} style={contactUsStyle}>
        {cONTACTUS}
      </div>
    </button>
  );
};

export default Button1;
