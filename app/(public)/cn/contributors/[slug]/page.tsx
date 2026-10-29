// Same reasoning as ../page.tsx: the contributor directory/detail pages are
// not country-scoped, so this reuses the NZ route's page rather than
// duplicating it.
export { default, generateMetadata } from "../../../contributors/[slug]/page";
