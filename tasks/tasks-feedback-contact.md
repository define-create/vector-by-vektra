## Relevant Files

- `lib/rate-limit.ts` - Add feedbackLimiter (3 per 10 minutes per user)
- `lib/email.ts` - Add sendFeedbackEmail() function
- `app/api/feedback/route.ts` - New POST route for feedback submission (create)
- `components/nav/FeedbackSheet.tsx` - New bottom sheet component (create)
- `components/nav/TopHeader.tsx` - Add feedback icon button and render FeedbackSheet

### Notes
- Use `npx jest [optional/path/to/test/file]` to run tests.
- No Prisma schema changes — no need to run `npx prisma generate`.
- In dev (no RESEND_API_KEY set), sendFeedbackEmail() falls back to console.log — no email is sent.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [x]` to `- [x]`.
Update the file after completing each sub-task, not just after completing a parent task.

## Tasks

- [x] 1.0 Add feedback rate limiter to lib/rate-limit.ts
  - [x] 1.1 Open `lib/rate-limit.ts` and append `feedbackLimiter` using `Ratelimit.slidingWindow(3, "10 m")` with prefix `"rl:feedback"` and `ephemeralCache: new Map()`
  - [x] 1.2 Export `feedbackLimiter` alongside the existing limiters

- [x] 2.0 Add sendFeedbackEmail() to lib/email.ts
  - [x] 2.1 Append `sendFeedbackEmail()` following the existing pattern: check `RESEND_API_KEY`, `console.log` fallback in dev, dynamic import of Resend
  - [x] 2.2 Set `to: "vectorbyvektra@gmail.com"`, `replyTo: fromEmail`, `from: process.env.EMAIL_FROM`
  - [x] 2.3 Define an `esc()` helper to HTML-escape `&`, `<`, `>` — apply it to `subject` and `message` before interpolating into the HTML body
  - [x] 2.4 Subject line format: `[Vector Feedback] ${esc(subject) || "(no subject)"}`

- [x] 3.0 Create POST /api/feedback route
  - [x] 3.1 Create `app/api/feedback/route.ts`
  - [x] 3.2 Require authenticated session with `session.user.email` — return 401 if missing
  - [x] 3.3 Apply `feedbackLimiter` by `session.user.id`; return 429 with `Retry-After` header if exceeded; wrap in try/catch to fail open if Upstash is unavailable
  - [x] 3.4 Parse and validate body: `message` required (non-empty string, max 2000 chars), `subject` optional (max 200 chars)
  - [x] 3.5 Call `sendFeedbackEmail({ fromEmail: session.user.email, subject, message })`
  - [x] 3.6 Return `{ ok: true }` on success; `{ error: "Failed to send feedback" }` with status 500 on Resend failure

- [x] 4.0 Create FeedbackSheet bottom sheet component
  - [x] 4.1 Create `components/nav/FeedbackSheet.tsx`; props: `{ open: boolean; onClose: () => void; userEmail: string }`
  - [x] 4.2 Implement backdrop (opacity transition, `pointer-events-none` when closed) and sheet (`translate-y-0` / `translate-y-full`, `duration-200 ease-out`)
  - [x] 4.3 Add `useEffect` on `open`: reset `subject`, `message`, `error`, `success` state when sheet closes (`open === false`)
  - [x] 4.4 Add form fields: read-only "We'll reply to: {userEmail}" line; subject `<input>` (optional, `maxLength={200}`); message `<textarea>` (required, `maxLength={2000}`, `resize-none`, `rows={5}`)
  - [x] 4.5 Add error display (`text-red-400` paragraph) and submit button (`bg-zinc-200 text-zinc-900 hover:bg-white`, disabled when message is empty or submitting)
  - [x] 4.6 Implement submit handler: POST to `/api/feedback`, manage `submitting` boolean state, show error message on failure
  - [x] 4.7 Implement success state: emerald checkmark icon + "Thanks for the feedback!" heading + "We'll reply to {userEmail}" subtext
  - [x] 4.8 Add `useEffect` on `success`: `setTimeout(onClose, 2000)` with cleanup — auto-closes sheet after success
  - [x] 4.9 Apply iPhone safe-area padding: `style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}`

- [x] 5.0 Wire FeedbackSheet into TopHeader
  - [x] 5.1 Add `useState` to the React import in `components/nav/TopHeader.tsx`
  - [x] 5.2 Import `FeedbackSheet` from `"@/components/nav/FeedbackSheet"`
  - [x] 5.3 Add `const [feedbackOpen, setFeedbackOpen] = useState(false)` inside the component body
  - [x] 5.4 Insert the feedback bubble `<button>` between the admin gear link and the profile link in the right-side `<div className="flex items-center gap-3">`
  - [x] 5.5 Render `<FeedbackSheet>` just before `</header>`, gated on `session?.user?.email`
