<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Public app information and editable settings live in the existing `app_config` record; this keeps guest and manager views synchronized without schema changes.
- Only יוסף and אליסף may edit app settings and export/import data, while lender management stays restricted to יוסף; keep authorization in server functions as well as the UI.
- The uploaded portrait is served as a Lovable asset pointer for page branding; browser and installed-app icons use local, size-specific ICO/PNG resources with versioned references so icon caches refresh.
- Manager request alerts compare successive pending-request snapshots in the management shell; this uses the existing authenticated server function and avoids exposing request data to unauthenticated browser subscriptions.
- Cloud reads are manual-only: no polling, focus or reconnect refetch, infinite staleTime; data refreshes after own mutations (invalidate ["m"]) or a page reload; signed photo URLs are reused server-side so browsers cache images, to minimize cloud usage. Request badge/alerts derive from the shell pending-requests snapshot. Search input is debounced.
- Borrower WhatsApp summaries use a shared client-safe formatter and the existing app configuration; always include all unreturned tools and their due dates even when the list placeholder is omitted.
