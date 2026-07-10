// Sheet presentation of the match detail (registered as a formSheet in
// app/_layout.tsx). Reuses the exact same screen as the full-page match/[id]
// route — only the presentation differs. Opened as a secondary drill-down
// (e.g. tapping a fixture inside a team page); the Matches home stays a page.
export { default } from '../match/[id]';
