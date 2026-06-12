# SSFitness Operator Guide

This guide is for non-technical Stryv operators using the app with ChatGPT support.

## How To Ask ChatGPT For Help

Use clear commands. ChatGPT should either show you what it sees, explain the next step, or operate the admin UI with your confirmation.

Good prompts:

- "Good Afternoon Chat, this is TP, your FDE. We're about to begin onboarding, please set everything up."
- "Open StryvAdmin and check system health."
- "Show me the workout builder for Maya."
- "Use the wger library to pick a lower-body exercise."
- "Draft a remote workout for Jordan, but do not publish yet."
- "Check whether support is connected to Linear."
- "File a support request: the meal planner is not loading."
- "Show me the client flow as a remote session."
- "Review the payment-gated flow for 7 days past due."

Safe operating language:

- "Show me" means navigate and explain without changing client-visible state.
- "Draft" means prepare content but do not publish.
- "Publish" means client-visible action; ChatGPT should confirm before doing it unless you explicitly say to proceed.
- "Check system health" means inspect `/api/incidents`, System Health, and setup errors.
- "Verify wger" means check `/api/wger/exercises` and the `/admin/workouts` library source.

## Client App

Open `/book` for the client experience.

When no session is scheduled:

- The user sees the calendar only.
- Meal prep and journaling are not shown up front.
- The floating square hamburger button in the bottom right opens the phase menu.

When a session is scheduled:

- Remote and in-person demo paths are currently URL-driven.
- Use `/book?session=remote` to show the countdown and remote workout flow.
- After the countdown, the workout appears.
- Mark the workout done, then swipe right/down or tap continue to move to the next phase.
- The app briefly shows "Checking your next best step" before displaying the next phase or a payment prompt.

Meal prep:

- The meal prep phase lets users search/filter Ideal Nutrition meals.
- Selected meals update cost, protein, calories, and the Pulse brief.
- The standalone page is `/meals`.
- Published meal plans have backend storage ready; visible meal-card delivery still needs the frontend wiring pass.
- Client meal-change requests have backend storage ready; visible delivery still depends on the current frontend wiring pass.

Journaling:

- The journal phase asks short reflection prompts after workout/meal prep.
- This is currently local UI, not a complete saved journal backend.
- Trainer notes have backend storage ready for `/notes`; visible rendering still needs the frontend wiring pass.

Payment prompts:

- The app should not nag on the home calendar.
- Payment prompts happen when the user transitions phases.
- Demo payment state uses `/book?session=remote&pastDueDays=7`.
- At 7+ days past due, booking should be locked once live billing state is wired.

## StryvAdmin

Open `/admin/pulse` for appointments and meal operations.

Use it to:

- View appointment command items.
- Schedule Google Calendar blocks.
- Select a client.
- Review client readiness.
- Manage meal plan targets.
- Use Ideal Nutrition meal selection.
- File support requests.
- Check System Health.

Open `/admin/workouts` for workout operations.

Use it to:

- Select the client.
- Edit the plan title.
- Edit warmup, main lift, accessory circuit, and remote video notes.
- Select exercise ideas from the wger library.
- Review the training week.
- Schedule the workout block.
- Use "Post to client" for current UX feedback; backend storage and client reads are ready, but visible delivery still needs a frontend wiring pass.
- Saved workout routine data is available through backend APIs; direct wger mirroring needs the wger host and API token configured.
- Saved meal plan data is available through `/api/admin/meal-plans` and `/api/client/meal-plans` once frontend wiring is allowed.

Open `/admin/settings` for trainer-facing settings:

- Trainer phone.
- Trainer name.
- Values are shown to members in the coach/contact experience.

## ChatGPT Admin Control Examples

Booking:

```text
Chat, open /admin/pulse, select Maya, schedule a 60-minute training block at 10 AM, and show me the Google Calendar handoff before I approve it.
```

Workout:

```text
Chat, open /admin/workouts, select Jordan, draft a remote hotel workout using wger suggestions, and stop before publishing.
```

Meal plan:

```text
Chat, open /admin/pulse?tab=meals, review Devon's meal plan targets, select five high-protein meals, and summarize the Pulse brief.
```

Support:

```text
Chat, check System Health. If setup is missing, tell me exactly which env or service is blocking it.
```

Support filing:

```text
Chat, file a medium support request that says: the meal planner did not load on the admin page.
```

wger:

```text
Chat, verify wger is connected and show me the first three exercises the app is receiving.
```

Client walkthrough:

```text
Chat, show the client remote session flow with the countdown, workout completion, and next-phase transition.
```

Payment walkthrough:

```text
Chat, open /book?session=remote&pastDueDays=7 and show me where the app blocks booking and where it nags.
```

## What Not To Do

- Do not ask ChatGPT to invent real client billing state.
- Do not publish client-visible workout/meal content without reviewing it.
- Do not treat demo query params as production data.
- Do not ignore System Health setup warnings.
- Do not paste live secrets into chat unless the environment explicitly requires them and TP approves.
