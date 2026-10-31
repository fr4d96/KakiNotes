/**
 * The anonymous note-writing page (/notes/[token]) on its own: no site
 * header, footer or bottom tab bar. The person opening a shared link only
 * needs the link's name and the form -- the site's navigation would just
 * lead them away from it (owner decision, 2026-10-31).
 */
export default function NoteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main id="main-content" className="flex-1">
      {children}
    </main>
  );
}
