# Supabase setup

Create or select one project, apply all migrations in order, and enable Google and GitHub under Authentication providers. Add the project URL and publishable key to browser-visible variables. Keep the service-role key server-only. Private user files belong in `user-files`; chat uploads belong in `chat-attachments`. In both buckets, paths must begin with the authenticated user ID.

Add redirect URLs for `http://localhost:3000/auth/callback`, every approved Vercel preview pattern, the Vercel production domain, the Sites production domain, and the custom domain. Avoid wildcards broader than the deployment platform requires.
