/**
 * BIBI Cars — Public Layout
 *
 * Single source of truth for the public site chrome.
 * Every public route renders inside this layout, which mounts
 * the Figma `Header1` + `Footer1` once via `<BibiHeader />` / `<BibiFooter />`.
 *
 * Pages MUST NOT render their own header / footer — there is one,
 * unified design across the entire public site.
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import { BibiHeader, BibiFooter } from './BibiPublicLayout';

const PublicLayout = () => (
  <div className="bibi-about min-h-screen flex flex-col bg-black text-white">
    <BibiHeader />
    <main className="flex-grow bibi-about__main">
      <Outlet />
    </main>
    <BibiFooter />
  </div>
);

export default PublicLayout;
