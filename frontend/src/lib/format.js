export const SIZES = [
  { key: "klein", label: "Klein", cm: "26 cm" },
  { key: "mittel", label: "Mittel", cm: "30 cm" },
  { key: "gross", label: "Groß", cm: "34 cm" },
];

export const sizeLabel = (k) => SIZES.find((s) => s.key === k)?.label ?? k;

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
export const money = (n) => eur.format(n || 0);

export const berlinDateTime = (iso, opts) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", ...opts }).format(new Date(iso));
