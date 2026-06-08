/**
 * TopVehicleDealsBlock — legacy alias.
 *
 * The active landing page is `FigmaHomePage` (mounted at `/`) which already
 * renders the catalogue via `figma_home/components/frame-component21.jsx`
 * with real `/api/public/vehicles` data and server-side pagination.
 *
 * This component is kept around because the older `HomePage.js` (Figma
 * reference parity layout) still imports it.  We delegate straight to the
 * same FrameComponent21 implementation to guarantee:
 *   • Identical card design across both home-page variants
 *   • No hardcoded "Lucid Motors Air Pure" / "20,000-30,000 EURO" / mock
 *     unsplash images anywhere in the codebase
 *   • Real-time pagination on whichever layout the operator chooses
 */
import React from 'react';
import FrameComponent21 from '../../figma_home/components/frame-component21';

export default function TopVehicleDealsBlock(props) {
  return <FrameComponent21 {...props} />;
}
