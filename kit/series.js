/* One config for the whole webinar series (SPEC §13). Every page loads this before js/dos-kit.js.
   Replace the placeholders; anything still containing YOUR_ is skipped automatically. */
window.DOS_SERIES = {
  siteName: 'Вебінари Олександра Ординського',
  author: {
    name: 'Олександр Ординський',
    title: 'Senior Full-Stack розробник · 10 років у розробці',
  },
  hub: 'https://webinars.ordynski.com/',
  ga4: 'G-CCB67R0XPL',               // Google Analytics 4 Measurement ID, e.g. G-AB12CD34EF
  socials: [
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/alex-ordynski/' },
    { label: 'GitHub', url: 'https://github.com/AlexOrd' },
    { label: 'Facebook', url: 'https://www.facebook.com/alexandr.ordynski' },
  ],
};
