// The contributor directory is not country-scoped in the data model (a
// contributor's nationality is independent of which country's stories they
// write -- lib/countries.ts vs lib/story/countries.ts are deliberately
// separate concepts). Rather than a second, divergeable copy, /cn/contributors
// reuses the exact same page. See ../../contributors/page.tsx.
export { default, generateMetadata } from "../../contributors/page";
