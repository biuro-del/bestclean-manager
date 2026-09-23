# Google Identity button production release

The production portal must be deployed with `firebase.portal-production.json`.
The default `firebase.json` is used by preview work and does not preserve the
complete production worker-admin routing contract.

Before a production release:

1. Confirm the candidate contains `e9e22ac21111c3c817e1ba6fbb970f6f645a0252`.
2. Confirm the worktree is clean and local HEAD equals its upstream.
3. Read the current `cleanzi-01` live-channel config and compare all rewrites
   with `firebase.portal-production.json`.
4. Run the focused Central Auth tests, the production Hosting config test,
   lint and the portal build.
5. Record the current live Hosting version as the rollback target.
6. Deploy only Hosting with the dedicated config and explicit project/site:

   `firebase deploy --config firebase.portal-production.json --project iclean-room --only hosting:cleanzi-01`

7. Verify `portal.cleanzi.pl`, Google login, session context and the protected
   worker-admin routes. If any smoke test fails, roll back Hosting to the
   recorded version before changing backend services.

Never deploy this change with broad `firebase deploy`, the preview config, or
an unverified live routing diff.
