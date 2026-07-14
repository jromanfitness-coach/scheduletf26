# Axon Performance Scheduler Portal v45

## Update summary

- Fixed Payroll Hours Estimate labels showing `undefined` for weekend days.
- Rebuilt the payroll-hours tool inside staff dashboards to be simpler and more reliable.
- Day tiles now show proper weekday labels for the full selected report period.
- + / - controls update the selected day immediately in the UI.
- Period total and payroll estimate update live before saving.
- Save Hours now uses the correct compensation permission and saves the selected pay-period hours to the shared Netlify server state.
- After saving, the staff dashboard reloads from the updated server-backed state.

## Deploy instructions

For an existing v44 deployment, replace:

- `index.html`

The server function already preserves `payrollHours`, so no server function replacement is required for this specific fix.


## v46 payroll-hours patch
- Payroll Hours Estimate now uses a two-week time-period selector: 07/02-07/15, 07/16-07/29, and continuing forward.
- Replaced plus/minus controls with a direct type-in hours field.
- Day tiles remain visible after saving and sync to the shared server state.
- The report default pay period now follows 14-day intervals anchored at 07/02/2026.


## v47 payroll monitor update
- Payroll hours now act as a live pay-period monitor, not a one-time save.
- The staff dashboard pay-period dropdown includes saved history across prior periods and labels periods with saved hours.
- Saving a pay period no longer closes or blanks the dashboard; the visible period updates in place from the shared server state.
- Saved hours remain tied to their exact dates and can be reviewed by reopening the same pay-period range.


## v48 Payroll Hours Persistence Fix

Payroll hours now save through a dedicated `savePayrollHours` server action instead of a full-state overwrite. This keeps historical pay-period hours visible when you reopen Reports days or weeks later. Replace both `index.html` and `netlify/functions/scheduler-api.mjs` when deploying this version.


## v51 PDF Export Fix

The Reports → Save PDF action now prints through a hidden same-page frame instead of relying on a new popup window. If browser printing is blocked, it downloads a printable HTML report as a fallback. You can deploy index.html only over v50.
